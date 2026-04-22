import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface AttendanceInput {
    studentId: string;
    subjectId: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    date: string;
    lectureNumber?: number;
}

// POST - Save attendance records (per-lecture)
export async function POST(request: NextRequest) {
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

        // Only HOD and Teacher can mark attendance
        if (!['hod', 'teacher'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { records, subjectId, date, lectureNumber = 1, sessionLectureNumber, topic } = await request.json() as {
            records: AttendanceInput[];
            subjectId?: string;
            date?: string;
            lectureNumber?: number;
            sessionLectureNumber?: number | null;
            topic?: string;
        };

        if (!records || records.length === 0) {
            return NextResponse.json({ error: 'No attendance records provided' }, { status: 400 });
        }

        // AUTO-ASSIGN LECTURE NUMBER
        // Determine lecture number for this teacher on this subject/date
        const firstRecord = records[0];
        const batchSubjectId = firstRecord.subjectId || subjectId;
        const batchDate = firstRecord.date || date;

        if (!batchSubjectId || !batchDate) {
            return NextResponse.json({ error: 'Subject ID and date are required' }, { status: 400 });
        }

        // Check if this teacher already marked attendance for this subject/date
        const existingLecture = await query<{ lecture_number: number }>(
            `SELECT lecture_number FROM attendance_records 
             WHERE teacher_id = $1 AND subject_id = $2 AND date = $3
             LIMIT 1`,
            [payload.userId, batchSubjectId, batchDate]
        );

        let assignedLectureNumber: number;
        if (existingLecture.length > 0) {
            // Teacher already marked this subject today - reuse their lecture number
            assignedLectureNumber = existingLecture[0].lecture_number;
        } else if (sessionLectureNumber && sessionLectureNumber > 0) {
            // Same page session (teacher switched dept/subject without navigating away)
            // Reuse the session's lecture number for continuity
            assignedLectureNumber = sessionLectureNumber;
        } else {
            // New session: find the next available lecture number across ALL this teacher's records today
            // This ensures proper incrementing even when marking different subjects in new sessions
            const maxLecture = await query<{ max_lecture: string | null }>(
                `SELECT COALESCE(MAX(lecture_number), 0) as max_lecture
                 FROM attendance_records
                 WHERE teacher_id = $1 AND date = $2`,
                [payload.userId, batchDate]
            );
            assignedLectureNumber = (parseInt(maxLecture[0]?.max_lecture || '0')) + 1;
        }

        // === OPTIMIZED: Checks done ONCE per batch, not per record ===

        // 1. Prevent Future Dates (check ONCE)
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        const todayStr = istTime.toISOString().split('T')[0];

        if (batchDate > todayStr) {
            return NextResponse.json({ error: `Cannot mark attendance for future date: ${batchDate}` }, { status: 400 });
        }

        // 1.5 Prevent Sunday Attendance
        const batchDateObj = new Date(batchDate);
        if (batchDateObj.getUTCDay() === 0) {
            return NextResponse.json({ error: `Cannot mark attendance on Sunday (Weekend Holiday)` }, { status: 400 });
        }

        // 2. Verify Teacher Assignment ONCE (not per record)
        const assignmentCheck = await query(
            'SELECT 1 FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2',
            [payload.userId, batchSubjectId]
        );

        if (assignmentCheck.length === 0) {
            console.warn(`User ${payload.userId} not assigned to subject ${batchSubjectId}`);
            return NextResponse.json({ error: 'Not assigned to this subject' }, { status: 403 });
        }

        // 3. Auto-detect semester from first student in batch
        const firstStudentSemester = await query<{ current_semester: number }>(
            'SELECT current_semester FROM students WHERE id = $1',
            [records[0].studentId]
        );
        const batchSemester = firstStudentSemester.length > 0 ? firstStudentSemester[0].current_semester : 1;

        // 4. Batch INSERT using unnest() — 1 query instead of N
        const subjectIds: string[] = [];
        const studentIds: string[] = [];
        const statuses: string[] = [];

        for (const record of records) {
            if (!record.studentId || !record.status) continue;
            subjectIds.push(record.subjectId || batchSubjectId);
            studentIds.push(record.studentId);
            statuses.push(record.status);
        }

        if (subjectIds.length === 0) {
            return NextResponse.json({ error: 'No valid attendance records' }, { status: 400 });
        }

        // Trim topic — store null if empty
        const topicValue = topic?.trim() || null;

        const result = await query(
            `INSERT INTO attendance_records (subject_id, student_id, teacher_id, date, lecture_number, semester, status, topic)
             SELECT unnest($1::uuid[]), unnest($2::uuid[]), $3, $4, $5, $6, unnest($7::text[]), $8
             ON CONFLICT (subject_id, student_id, teacher_id, date, lecture_number, semester)
             DO UPDATE SET status = EXCLUDED.status, topic = EXCLUDED.topic`,
            [subjectIds, studentIds, payload.userId, batchDate, assignedLectureNumber, batchSemester, statuses, topicValue]
        );

        const savedCount = subjectIds.length;

        return NextResponse.json({
            message: `Saved ${savedCount} attendance records`,
            savedCount,
            lectureNumber: assignedLectureNumber,
            semester: batchSemester,
        });
    } catch (error) {
        console.error('Save attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// GET - Get attendance records for a date and subject
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

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const subjectId = searchParams.get('subjectId');
        const lectureNumber = searchParams.get('lectureNumber');

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        try {
            let queryStr = `
                SELECT ar.id, ar.student_id, ar.subject_id, ar.teacher_id, ar.date, ar.lecture_number, ar.status,
                       s.roll_number, s.first_name, s.last_name,
                       sub.code as subject_code, sub.name as subject_name
                FROM attendance_records ar
                JOIN students s ON ar.student_id = s.id
                JOIN subjects sub ON ar.subject_id = sub.id
                WHERE ar.date = $1
            `;
            const params: (string | number)[] = [date];

            // RBAC: Teachers only see their own records
            if (payload.role === 'teacher') {
                params.push(payload.userId);
                queryStr += ` AND ar.teacher_id = $${params.length}`;
            }

            // RBAC: HODs only see their department's records
            if (payload.role === 'hod') {
                params.push(payload.userId);
                queryStr += ` AND ar.student_id IN (
                    SELECT id FROM students 
                    WHERE department_id = (SELECT department_id FROM users WHERE id = $${params.length})
                       OR department_id IN (SELECT department_id FROM user_departments WHERE user_id = $${params.length})
                )`;
            }

            if (subjectId) {
                params.push(subjectId);
                queryStr += ` AND ar.subject_id = $${params.length}`;
            }

            if (lectureNumber) {
                params.push(parseInt(lectureNumber));
                queryStr += ` AND ar.lecture_number = $${params.length}`;
            }

            queryStr += ' ORDER BY s.roll_number';

            const records = await query(queryStr, params);
            return NextResponse.json({ records });
        } catch (err) {
            console.error('Attendance query error:', err);
            return NextResponse.json({ error: 'Server error' }, { status: 500 });
        }
    } catch (error) {
        console.error('Get attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
