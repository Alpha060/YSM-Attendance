import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentData {
    id: string;
    student_id: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    department_name: string;
    current_semester: number;
    total_lectures: string;
    attended: string;
}

// GET - Student-wise attendance report
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { role, departmentId: userDeptId, userId } = payload;

        const { searchParams } = new URL(request.url);
        const subjectIdsParam = searchParams.get('subjectIds'); // allows comma-separated string
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');
        const originSemester = searchParams.get('originSemester');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Allow HOD to view as teacher (for My Reports)
        const view = searchParams.get('view');
        const effectiveRole = (role === 'hod' && view === 'teacher') ? 'teacher' : role;

        // Build filters
        const filters: string[] = [];
        const params: (string | number)[] = [];

        // Role-based restrictions
        if (effectiveRole === 'hod') {
            if (departmentId) {
                params.push(departmentId);
                params.push(userId);
                filters.push(`s.department_id = $${params.length - 1} AND s.department_id IN (
                    SELECT department_id FROM users WHERE id = $${params.length} AND role = 'hod'
                    UNION SELECT department_id FROM user_departments WHERE user_id = $${params.length} AND role = 'hod'
                )`);
            } else {
                params.push(userId);
                filters.push(`s.department_id IN (
                    SELECT department_id FROM users WHERE id = $${params.length} AND role = 'hod'
                    UNION SELECT department_id FROM user_departments WHERE user_id = $${params.length} AND role = 'hod'
                )`);
            }
        } else if (effectiveRole === 'teacher') {
            // Teacher: Only show students who are enrolled in subjects this teacher teaches
            params.push(userId);
            const teacherParamIdx = params.length;
            filters.push(`s.id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ts.subject_id = ss.subject_id
                WHERE ts.teacher_id = $${teacherParamIdx}
            )`);
            if (departmentId) {
                params.push(departmentId);
                filters.push(`s.department_id = $${params.length}`);
            }
        } else if (effectiveRole === 'super_admin' && departmentId) {
            params.push(departmentId);
            filters.push(`s.department_id = $${params.length}`);
        }

        // Track department filter params separately for availableSemesters query
        const deptFilterParams = [...params];
        const deptFilters = [...filters];

        // Determine if this is a historical semester query
        // A historical semester = semester that exists in student_subjects but not as any student's current_semester
        let isHistorical = false;
        let semesterNum = 0;

        if (semester) {
            semesterNum = parseInt(semester);
            // Check if any students in this department currently have this semester
            const currentCheck = await query<{ count: string }>(
                `SELECT COUNT(*) as count FROM students s 
                 LEFT JOIN departments d ON d.id = s.department_id
                 WHERE s.current_semester = $${deptFilterParams.length + 1} 
                 ${deptFilters.length > 0 ? 'AND ' + deptFilters.join(' AND ') : ''}`,
                [...deptFilterParams, semesterNum]
            );
            const hasCurrentStudents = parseInt(currentCheck[0]?.count || '0') > 0;

            if (hasCurrentStudents) {
                // Normal: filter by current_semester
                params.push(semesterNum);
                filters.push(`s.current_semester = $${params.length}`);
            } else {
                // Historical: find students who have student_subjects with this semester
                isHistorical = true;
                params.push(semesterNum);
                filters.push(`s.id IN (SELECT ss_hist.student_id FROM student_subjects ss_hist WHERE ss_hist.semester = $${params.length})`);

                // Scope to same batch: only students whose current_semester matches the origin
                if (originSemester) {
                    params.push(parseInt(originSemester));
                    filters.push(`s.current_semester = $${params.length}`);
                }
            }
        }

        // Subject filter
        if (subjectIdsParam) {
            const subjectIds = subjectIdsParam.split(',').filter(id => id.trim() !== '');
            if (subjectIds.length > 0) {
                const placeholders = subjectIds.map(id => {
                    params.push(id);
                    return `$${params.length}`;
                }).join(', ');
                filters.push(`ar.subject_id IN (${placeholders})`);
            }
        }

        // Date filter
        if (startDate) {
            params.push(startDate);
            filters.push(`ar.date >= $${params.length}`);
        }
        if (endDate) {
            params.push(endDate);
            filters.push(`ar.date <= $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        // For teachers, we also need to filter the COUNTs to only their subjects/records
        let teacherSubjectFilter = '1=1';
        if (role === 'teacher' && !subjectIdsParam) {
            let uIdIndex = params.indexOf(userId);
            if (uIdIndex === -1) {
                params.push(userId);
                uIdIndex = params.length - 1;
            }
            teacherSubjectFilter = `ar.teacher_id = $${uIdIndex + 1} AND ar.subject_id IN (SELECT subject_id FROM teacher_subjects WHERE teacher_id = $${uIdIndex + 1})`;
        }

        // Build the subject scope for attendance counting
        let subjectScopeClause: string;
        if (isHistorical) {
            // Historical: only count attendance for subjects from that specific semester
            subjectScopeClause = `ss.semester = ${semesterNum}`;
        } else {
            // Current: count attendance for current semester subjects
            subjectScopeClause = `(ss.semester = s.current_semester OR ss.semester IS NULL)`;
        }

        const queryStr = `
            SELECT 
                s.id,
                s.student_id,
                s.roll_number,
                s.first_name,
                s.last_name,
                d.name as department_name,
                s.current_semester,
                COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text) as total_lectures,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END) as attended
            FROM students s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.subject_id IN (SELECT ss.subject_id FROM student_subjects ss WHERE ss.student_id = s.id AND ${subjectScopeClause}) AND (${teacherSubjectFilter})
            WHERE 1=1
            ${filterClause}
            GROUP BY s.id, s.student_id, s.roll_number, s.first_name, s.last_name, d.name, s.current_semester
            ORDER BY s.roll_number ASC
        `;

        const students = await query<StudentData>(queryStr, params);

        // Fetch subject-wise attendance for all matching students
        const subjectQueryStr = `
            SELECT 
                s.id as student_id,
                sub.id as subject_id,
                sub.name as subject_name,
                sub.paper_code as subject_paper_code,
                COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END) as attended
            FROM students s
            JOIN attendance_records ar ON ar.student_id = s.id
            JOIN subjects sub ON sub.id = ar.subject_id
            JOIN student_subjects ss ON ss.student_id = s.id AND ss.subject_id = sub.id AND ${subjectScopeClause}
            WHERE 1=1
              AND (${teacherSubjectFilter})
              ${filterClause}
            GROUP BY s.id, sub.id, sub.name, sub.paper_code
        `;

        const subjectAttendanceRows = await query<{
            student_id: string;
            subject_id: string;
            subject_name: string;
            subject_paper_code: string | null;
            total_classes: string;
            attended: string;
        }>(subjectQueryStr, params);

        const subjectAttendanceMap: Record<string, any[]> = {};
        subjectAttendanceRows.forEach(row => {
            if (!subjectAttendanceMap[row.student_id]) {
                subjectAttendanceMap[row.student_id] = [];
            }
            subjectAttendanceMap[row.student_id].push({
                subjectId: row.subject_id,
                subjectName: row.subject_name,
                paperCode: row.subject_paper_code,
                totalClasses: parseInt(row.total_classes) || 0,
                attended: parseInt(row.attended) || 0
            });
        });

        // Get current semesters (from students table)
        const deptFilterClause = deptFilters.length > 0 ? 'AND ' + deptFilters.join(' AND ') : '';
        const currentSemRows = await query<{ current_semester: number }>(
            `SELECT DISTINCT s.current_semester FROM students s 
             LEFT JOIN departments d ON d.id = s.department_id
             WHERE 1=1 ${deptFilterClause}
             ORDER BY s.current_semester`,
             deptFilterParams
        );
        const currentSemesters = currentSemRows.map(r => r.current_semester);

        // Get historical semesters (from student_subjects, excluding current semesters)
        const deptFilterClause2 = deptFilterClause.replace(/(?<![a-zA-Z_])s\./g, 's2.');
        const histSemRows = await query<{ semester: number }>(
            `SELECT DISTINCT COALESCE(ss.semester, s2.current_semester) as semester
             FROM student_subjects ss
             JOIN students s2 ON s2.id = ss.student_id
             LEFT JOIN departments d ON d.id = s2.department_id
             WHERE 1=1 ${deptFilterClause2}
             AND COALESCE(ss.semester, s2.current_semester) IS NOT NULL
             ORDER BY semester`,
            deptFilterParams
        );
        const allSubjectSems = histSemRows.map(r => r.semester);
        // Historical = semesters in student_subjects that are NOT any student's current_semester in this dept
        const currentSet = new Set(currentSemesters);
        const historicalSemesters = allSubjectSems.filter(s => !currentSet.has(s));

        const formattedStudents = students.map(s => ({
            id: s.id,
            studentId: s.student_id,
            rollNumber: s.roll_number,
            name: `${s.first_name} ${s.last_name}`,
            department: s.department_name || 'N/A',
            semester: s.current_semester,
            totalClasses: parseInt(s.total_lectures) || 0,
            attended: parseInt(s.attended) || 0,
            percentage: parseInt(s.total_lectures) > 0
                ? Math.round((parseInt(s.attended) / parseInt(s.total_lectures)) * 100)
                : 0,
            subjectAttendance: subjectAttendanceMap[s.id] || []
        }));

        return NextResponse.json({ 
            students: formattedStudents,
            currentSemesters,
            historicalSemesters,
            isHistorical
        });
    } catch (error) {
        console.error('Student report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
