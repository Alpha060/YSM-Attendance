import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { parseStudentId, ParsedStudentId, BatchConfig } from '@/lib/parseStudentId';

// Helper: collect subject enrollments for a student (used by both insert and update paths)
function collectSubjectEnrollments(
    student: any,
    parsed: ParsedStudentId,
    studentDbId: string,
    finalSemester: number,
    degreeType: string,
    allSubjects: any[],
    enrollmentBatch: { studentId: string; subjectId: string; semester: number }[]
) {
    const subjectInputs: { value: string; isCrossDegree: boolean }[] = [];

    if (student.subject_codes) {
        student.subject_codes.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((code: string) => {
            subjectInputs.push({ value: code, isCrossDegree: false });
        });
    }

    const crossDegreeFields = ['minor', 'mdc', 'vac', 'aec', 'ge1', 'ge2', 'generic1', 'generic2'];
    ['core1', 'core2', 'core3', 'major_subject', 'major', 'minor', 'mdc', 'vac', 'aec', 'aecc',
        'ge1', 'ge2', 'generic1', 'generic2'].forEach(col => {
            if (student[col] && typeof student[col] === 'string' && student[col].trim()) {
                const isCrossDegree = crossDegreeFields.includes(col);
                subjectInputs.push({ value: student[col].trim(), isCrossDegree });
            }
        });

    /*
    if (parsed.courseType === 'vocational' && parsed.geSubjects) {
        const hasGeneric1 = student.generic1 || student.ge1;
        const hasGeneric2 = student.generic2 || student.ge2;
        if (!hasGeneric1 && parsed.geSubjects.ge1) {
            subjectInputs.push({ value: parsed.geSubjects.ge1, isCrossDegree: true });
        }
        if (!hasGeneric2 && parsed.geSubjects.ge2) {
            subjectInputs.push({ value: parsed.geSubjects.ge2, isCrossDegree: true });
        }
    }
    */

    if (subjectInputs.length > 0) {
        const departmentSubjects = allSubjects.filter((s: any) =>
            s.degree_type === degreeType && s.semesters.includes(finalSemester)
        );
        const allSemesterSubjects = allSubjects.filter((s: any) =>
            s.semesters.includes(finalSemester)
        );

        for (const input of subjectInputs) {
            const inputUpper = input.value.toUpperCase();
            const searchPool = input.isCrossDegree ? allSemesterSubjects : departmentSubjects;

            const matchedSubject = searchPool.find((s: any) =>
                s.code.toUpperCase() === inputUpper ||
                s.name.toUpperCase() === inputUpper ||
                s.name.toUpperCase().includes(inputUpper) ||
                inputUpper.includes(s.name.toUpperCase())
            );

            if (matchedSubject) {
                enrollmentBatch.push({ studentId: studentDbId, subjectId: matchedSubject.id, semester: finalSemester });
            }
        }
    }
}

export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const body = await req.json();
        const { students } = body;

        if (!Array.isArray(students) || students.length === 0) {
            return NextResponse.json({ error: 'No student data provided' }, { status: 400 });
        }

        if (students.length > 500) {
            return NextResponse.json({ error: 'Maximum 500 students per import' }, { status: 400 });
        }

        const results = {
            success: 0,
            updated: 0,
            failed: 0,
            errors: [] as { row: number, name: string, error: string }[]
        };

        // Cache departments for validation
        const deptResult = await client.query(
            'SELECT id, code, dept_type, degree_type FROM departments'
        );
        const departmentMap = new Map(deptResult.rows.map((d: any) => [d.code.toUpperCase(), { id: d.id, deptType: d.dept_type, degreeType: d.degree_type }]));

        // Fetch admin's batch config for semester mapping
        const batchConfigResult = await client.query(
            `SELECT key, value FROM application_settings WHERE key LIKE 'batch_mapping_%'`
        );
        const batchConfig: BatchConfig = {};
        batchConfigResult.rows.forEach((row: any) => {
            const deptType = row.key.replace('batch_mapping_', '');
            batchConfig[deptType] = row.value;
        });

        // Cache ALL subjects with their semesters
        const subjectResult = await client.query(
            `SELECT s.id, s.code, s.name, s.degree_type,
                    COALESCE(array_agg(ss.semester ORDER BY ss.semester), ARRAY[]::integer[]) as semesters
             FROM subjects s
             LEFT JOIN subject_semesters ss ON ss.subject_id = s.id
             GROUP BY s.id, s.code, s.name, s.degree_type`
        );
        const allSubjects = subjectResult.rows;

        // Get current academic year
        const academicYear = '2025-2026';

        // Batch: Fetch all existing student_ids and emails in one query
        const allStudentIds = students
            .filter((s: any) => s.student_id)
            .map((s: any) => s.student_id.toUpperCase());
        const allEmails = students
            .filter((s: any) => s.email)
            .map((s: any) => s.email);

        const existingResult = await client.query(
            `SELECT id, student_id, email, first_name, last_name, roll_number, current_semester, department_id FROM students 
             WHERE student_id = ANY($1) OR (email = ANY($2) AND email IS NOT NULL AND email != '')`,
            [allStudentIds, allEmails]
        );
        // Map existing student IDs to their DB records for update comparison
        const existingStudentMap = new Map<string, any>();
        existingResult.rows.forEach((r: any) => {
            if (r.student_id) existingStudentMap.set(r.student_id.toUpperCase(), r);
        });
        const existingEmails = new Set(existingResult.rows.map((r: any) => r.email?.toLowerCase()).filter(Boolean));

        // Use a single transaction for all inserts
        await client.query('BEGIN');

        // Collect subject enrollments for batch insert at the end
        const enrollmentBatch: { studentId: string; subjectId: string; semester: number }[] = [];

        // Collect valid NEW students for batch insert
        const studentBatch: any[] = [];

        // Collect existing students that need UPDATE
        const updateBatch: any[] = [];
        
        // Collect existing student ids that need their subjects wiped before re-insert
        const existingStudentsToSync: string[] = [];

        // Process each student
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const rowNum = i + 1;

            try {
                // Handle 'name' field: split into first_name/last_name if needed
                if (student.name && !student.first_name) {
                    const parts = student.name.trim().split(/\s+/);
                    student.first_name = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                    student.last_name = parts.length > 1 ? parts[parts.length - 1] : '';
                }

                // 1. Basic Validation
                if (!student.student_id || !student.first_name) {
                    throw new Error('Missing required fields (Student ID, Name)');
                }

                // 2. Parse Student ID to auto-detect fields
                const parsed = parseStudentId(student.student_id, batchConfig);
                if (!parsed.isValid) {
                    throw new Error(`Invalid Student ID format: ${parsed.error}`);
                }

                // 3. Find department based on parsed info
                let deptId: string | undefined;
                let degreeType: string | undefined;

                if (parsed.courseType === 'vocational') {
                    if (parsed.prefix === 'BBA') {
                        deptId = departmentMap.get('BBA')?.id;
                        degreeType = departmentMap.get('BBA')?.degreeType;
                    } else if (parsed.prefix === 'BCA' || parsed.prefix === 'BSCCA' || parsed.prefix === 'BCOMCA') {
                        deptId = departmentMap.get('BCA')?.id;
                        degreeType = departmentMap.get('BCA')?.degreeType;
                    } else {
                        deptId = departmentMap.get('IT')?.id;
                        degreeType = departmentMap.get('IT')?.degreeType;
                    }
                } else if (parsed.courseType === 'regular' && parsed.deptCode) {
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase())?.id;
                    degreeType = departmentMap.get(parsed.deptCode.toUpperCase())?.degreeType;
                } else if (parsed.courseType === 'pg' && parsed.deptCode) {
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase())?.id;
                    degreeType = departmentMap.get(parsed.deptCode.toUpperCase())?.degreeType;
                }

                if (student.department_code) {
                    const overrideDept = departmentMap.get(student.department_code.toUpperCase());
                    if (overrideDept) {
                        deptId = overrideDept.id;
                        degreeType = overrideDept.degreeType;
                    }
                }

                if (!deptId) {
                    throw new Error(`Could not find department for: ${parsed.deptCode || student.department_code || 'unknown'}`);
                }

                const finalDegreeType = degreeType || '';

                // 4. Override semester using specific department batch config
                let resolvedSemester = parsed.semester || 1;
                if (parsed.admissionYear && deptId) {
                    const deptBatchConfig = batchConfig[`dept_${deptId}`];
                    if (deptBatchConfig) {
                        for (const [semStr, batchYear] of Object.entries(deptBatchConfig)) {
                            if (batchYear === parsed.admissionYear) {
                                resolvedSemester = parseInt(semStr);
                                break;
                            }
                        }
                    } else {
                        // Fallback to legacy dept_type config if needed
                        const actualDeptType = departmentMap.get(student.department_code?.toUpperCase() || parsed.deptCode?.toUpperCase() || '')?.deptType;
                        if (actualDeptType && batchConfig[actualDeptType]) {
                            for (const [semStr, batchYear] of Object.entries(batchConfig[actualDeptType])) {
                                if (batchYear === parsed.admissionYear) {
                                    resolvedSemester = parseInt(semStr);
                                    break;
                                }
                            }
                        }
                    }
                }

                // 5. Check if student already exists — update instead of skipping
                const sid = student.student_id.toUpperCase();
                const email = student.email?.toLowerCase();
                const existingStudent = existingStudentMap.get(sid);

                // 6. Determine final values
                const finalRollNumber = student.roll_number ? parseInt(student.roll_number) : (parsed.rollNumber || 0);
                const finalSemester = student.semester ? parseInt(student.semester) : resolvedSemester;

                if (existingStudent) {
                    // EXISTING student — check if any data changed, and queue update
                    const hasChanges = 
                        existingStudent.first_name !== student.first_name ||
                        existingStudent.last_name !== (student.last_name || '') ||
                        (student.email && existingStudent.email !== student.email) ||
                        existingStudent.roll_number !== finalRollNumber ||
                        existingStudent.current_semester !== finalSemester ||
                        existingStudent.department_id !== deptId;

                    if (hasChanges) {
                        updateBatch.push({
                            existingId: existingStudent.id,
                            sid,
                            finalRollNumber,
                            firstName: student.first_name,
                            lastName: student.last_name || '',
                            email: student.email || existingStudent.email || null,
                            deptId,
                            finalSemester,
                            batchYear: parsed.admissionYear || new Date().getFullYear()
                        });
                        results.updated++;
                    } else {
                        results.updated++; // Count as updated (no changes)
                    }

                    // Use existing ID for subject enrollments
                    const studentIdForEnrollments = existingStudent.id;
                    existingStudentsToSync.push(studentIdForEnrollments);
                    collectSubjectEnrollments(student, parsed, studentIdForEnrollments, finalSemester, finalDegreeType, allSubjects, enrollmentBatch);

                    // Prevent re-processing within the batch
                    existingStudentMap.set(sid, { ...existingStudent, first_name: student.first_name, last_name: student.last_name });
                    continue; // Don't add to new student batch
                }

                // Email conflict with a DIFFERENT student
                if (email && existingEmails.has(email)) {
                    throw new Error(`Duplicate Email (${student.email})`);
                }

                const newStudentId = uuidv4();

                // 6. Buffer NEW Student for insert
                studentBatch.push({
                    newStudentId,
                    sid,
                    finalRollNumber,
                    rollNumberOld: finalRollNumber.toString(),
                    firstName: student.first_name,
                    lastName: student.last_name || '',
                    email: student.email || null,
                    deptId,
                    finalSemester,
                    batchYear: parsed.admissionYear || new Date().getFullYear()
                });

                // Mark as existing to prevent duplicates within the batch
                existingStudentMap.set(sid, { id: newStudentId });
                if (email) existingEmails.add(email);

                // 7. Collect subject enrollments for new students
                collectSubjectEnrollments(student, parsed, newStudentId, finalSemester, finalDegreeType, allSubjects, enrollmentBatch);

                results.success++;

            } catch (err: any) {
                results.failed++;
                results.errors.push({
                    row: rowNum,
                    name: `${student.first_name || 'Unknown'} ${student.last_name || ''}`.trim(),
                    error: err.message
                });
            }
        }

        // Start transaction for batch inserts
        await client.query('BEGIN');

        // Batch insert all valid students in chunks of 50
        if (studentBatch.length > 0) {
            const STUDENT_CHUNK_SIZE = 50; // Keep at 50 to avoid too many PostgreSQL statement parameters
            for (let i = 0; i < studentBatch.length; i += STUDENT_CHUNK_SIZE) {
                const chunk = studentBatch.slice(i, i + STUDENT_CHUNK_SIZE);
                const values: string[] = [];
                const params: any[] = [];
                chunk.forEach((s, idx) => {
                    const offset = idx * 10;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`);
                    params.push(s.newStudentId, s.sid, s.finalRollNumber, s.rollNumberOld, s.firstName, s.lastName, s.email, s.deptId, s.finalSemester, s.batchYear);
                });
                await client.query(
                    `INSERT INTO students (
                        id, student_id, roll_number, roll_number_old,
                        first_name, last_name, email, department_id, current_semester, batch_year
                    ) VALUES ${values.join(', ')}`,
                    params
                );
            }
        }

        // Batch UPDATE existing students that have changes
        for (const s of updateBatch) {
            await client.query(
                `UPDATE students SET 
                    roll_number = $1, first_name = $2, last_name = $3, email = $4,
                    department_id = $5, current_semester = $6, batch_year = $7, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $8`,
                [s.finalRollNumber, s.firstName, s.lastName, s.email, s.deptId, s.finalSemester, s.batchYear, s.existingId]
            );
        }

        // Clear old subjects for existing students — ONLY for the specific semester being imported
        // This preserves historical subject data from previous semesters
        if (existingStudentsToSync.length > 0) {
            // Group by semester so we only clear the semesters that are being re-imported
            const semestersInBatch = new Set(enrollmentBatch
                .filter(e => existingStudentsToSync.includes(e.studentId))
                .map(e => e.semester));
            
            for (const sem of semestersInBatch) {
                await client.query(
                    `DELETE FROM student_subjects WHERE student_id = ANY($1) AND academic_year = $2 AND semester = $3`,
                    [existingStudentsToSync, academicYear, sem]
                );
            }
        }

        // Batch insert all subject enrollments in chunks of 100 (with semester)
        if (enrollmentBatch.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < enrollmentBatch.length; i += CHUNK_SIZE) {
                const chunk = enrollmentBatch.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: (string | number)[] = [];
                chunk.forEach((e, idx) => {
                    const offset = idx * 4;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                    params.push(e.studentId, e.subjectId, academicYear, e.semester);
                });
                await client.query(
                    `INSERT INTO student_subjects (student_id, subject_id, academic_year, semester)
                     VALUES ${values.join(', ')}
                     ON CONFLICT (student_id, subject_id, academic_year, semester) DO NOTHING`,
                    params
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json(results);

    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Import Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
