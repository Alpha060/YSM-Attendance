import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentDetail {
    id: string;
    student_id: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    email: string;
    department_name: string;
    current_semester: number;
}

interface SubjectStats {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    subject_paper_code: string | null;
    total_classes: string;
    attended: string;
    attendance_pct: string;
}

interface MonthlyStats {
    month: string;
    total_classes: string;
    attended: string;
    attendance_pct: string;
}

interface DailyRecord {
    date: string;
    subject_code: string;
    subject_name: string;
    lecture_number: number;
    status: string;
}

// GET - Get detailed stats for a specific student
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id: studentId } = await params;
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const reportSemester = searchParams.get('reportSemester'); // historical semester view

        // Get student basic info
        const studentInfo = await query<StudentDetail & { department_id: string }>(
            `SELECT s.id, s.student_id, s.roll_number, s.first_name, s.last_name, s.email, 
                    s.current_semester, s.department_id, d.name as department_name
             FROM students s
             LEFT JOIN departments d ON d.id = s.department_id
             WHERE s.id = $1`,
            [studentId]
        );

        if (studentInfo.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        // Allow HOD to view as teacher (for My Reports)
        const view = searchParams.get('view');
        const { role, userId } = payload;
        let effectiveRole = (role === 'hod' && view === 'teacher') ? 'teacher' : role;

        // Verify department access for HOD. If not HOD of the student's department, fallback to teacher-level access.
        if (effectiveRole === 'hod') {
            const studentDeptId = studentInfo[0].department_id;
            const owned = await query<{ department_id: string }>(
                `SELECT department_id FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'
                 UNION
                 SELECT department_id FROM users WHERE id = $1 AND department_id = $2 AND role = 'hod'`,
                [userId, studentDeptId]
            );
            if (owned.length === 0) {
                effectiveRole = 'teacher';
            }
        }

        // Build date filter clause
        let dateFilter = '';
        const dateParams: string[] = [];
        if (startDate && endDate) {
            dateFilter = ` AND ar.date >= $2 AND ar.date <= $3`;
            dateParams.push(startDate, endDate);
        } else if (startDate) {
            dateFilter = ` AND ar.date >= $2`;
            dateParams.push(startDate);
        } else if (endDate) {
            dateFilter = ` AND ar.date <= $2`;
            dateParams.push(endDate);
        }

        // Role-based filtering (Teachers only see their subjects)
        let teacherSubjectFilter = '1=1';
        let subjectJoinClause = '';

        if (effectiveRole === 'teacher') {
            // Find or add userId to params for the filter query
            // Note: We need a reliable index. Since param order matters for $1, $2 etc,
            // we must append userId if not present, but be careful with existing dateParams logic.
            // The queries below use specific param indices. We will inject userId into the params array used by query.

            // To be safe, we'll append userId to the existing arrays and use dynamic index
            // For subjectStats query: params are [studentId, ...dateParams]
            // We adding userId to the end => index is 1 + dateParams.length + 1
            const uIdIndex = 1 + dateParams.length + 1;

            // STRICT ISOLATION: Filter by who marked the attendance, AND only include subjects they are assigned to teach
            teacherSubjectFilter = `ar.teacher_id = $${uIdIndex} AND ar.subject_id IN (SELECT subject_id FROM teacher_subjects WHERE teacher_id = $${uIdIndex})`;

            // Keep subject join to ensure they only see subjects they are assigned to
            subjectJoinClause = `JOIN teacher_subjects ts ON ts.subject_id = s.id AND ts.teacher_id = $${uIdIndex}`;
        }

        // Determine the semester to filter subjects by
        // Default to student's current_semester so we only show current data
        const studentCurrentSem = studentInfo[0].current_semester;
        const targetSemester = reportSemester ? parseInt(reportSemester) : studentCurrentSem;

        // Build semester filter for student_subjects
        let semesterFilterClause = '';
        const semesterFilterParams: (string | number)[] = [];
        if (targetSemester) {
            semesterFilterParams.push(targetSemester);
            const semParamIdx = 1 + dateParams.length + (effectiveRole === 'teacher' ? 1 : 0) + semesterFilterParams.length;
            // Also match NULL semester (pre-migration rows) when viewing current semester
            if (targetSemester === studentCurrentSem) {
                semesterFilterClause = ` AND (ss.semester = $${semParamIdx} OR ss.semester IS NULL)`;
            } else {
                semesterFilterClause = ` AND ss.semester = $${semParamIdx}`;
            }
        }

        // Get subject-wise stats with date filter
        const subjectStatsParams: (string | number)[] = [studentId, ...dateParams];
        if (effectiveRole === 'teacher') {
            subjectStatsParams.push(userId);
        }
        subjectStatsParams.push(...semesterFilterParams);

        // Also filter attendance_records by semester when viewing history
        let arSemesterFilter = '';
        if (targetSemester) {
            arSemesterFilter = ` AND ar.semester = ${targetSemester}`;
        }

        const subjectStats = await query<SubjectStats>(
            `SELECT 
                s.id as subject_id,
                s.name as subject_name,
                s.code as subject_code,
                s.paper_code as subject_paper_code,
                COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END)::numeric * 100 / 
                        NULLIF(COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM student_subjects ss
             JOIN subjects s ON s.id = ss.subject_id
             ${subjectJoinClause}
             LEFT JOIN attendance_records ar ON ar.subject_id = s.id AND ar.student_id = $1 ${dateFilter}${arSemesterFilter}
             WHERE ss.student_id = $1${semesterFilterClause}
             GROUP BY s.id, s.name, s.code, s.paper_code
             ORDER BY s.name`,
            subjectStatsParams
        );

        // Get monthly stats with date filter
        let monthlyQuery = `SELECT 
                TO_CHAR(ar.date, 'YYYY-MM') as month,
                COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END)::numeric * 100 / 
                        NULLIF(COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM attendance_records ar
             WHERE ar.student_id = $1 
               AND ar.subject_id IN (SELECT subject_id FROM student_subjects WHERE student_id = $1${targetSemester ? ` AND semester = ${targetSemester}` : ''})`;

        if (effectiveRole === 'teacher') {
            monthlyQuery += ` AND ${teacherSubjectFilter}`;
        }

        if (startDate && endDate) {
            monthlyQuery += ` AND ar.date >= $2 AND ar.date <= $3`;
        } else if (startDate) {
            monthlyQuery += ` AND ar.date >= $2`;
        } else if (endDate) {
            monthlyQuery += ` AND ar.date <= $2`;
        } else {
            monthlyQuery += ` AND ar.date >= CURRENT_DATE - INTERVAL '6 months'`;
        }
        monthlyQuery += ` GROUP BY TO_CHAR(ar.date, 'YYYY-MM') ORDER BY month DESC`;

        const otherStatsParams = [studentId, ...dateParams];
        if (effectiveRole === 'teacher') {
            otherStatsParams.push(userId);
        }

        const monthlyStats = await query<MonthlyStats>(monthlyQuery, otherStatsParams);

        // Overall summary with date filter
        let overallQuery = `SELECT 
                COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text END)::numeric * 100 / 
                        NULLIF(COUNT(DISTINCT ar.date::text || '-' || ar.subject_id::text || '-' || ar.lecture_number::text), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM attendance_records ar
             WHERE ar.student_id = $1 
               AND ar.subject_id IN (SELECT subject_id FROM student_subjects WHERE student_id = $1${targetSemester ? ` AND semester = ${targetSemester}` : ''}) ${dateFilter}`;

        if (effectiveRole === 'teacher') {
            overallQuery += ` AND ${teacherSubjectFilter}`;
        }

        const overallStats = await query<{ total_classes: string; attended: string; attendance_pct: string }>(
            overallQuery,
            otherStatsParams
        );

        // Get all semesters this student has subject enrollments for (for history dropdown)
        // Include NULL semester rows as current_semester (pre-migration data)
        const availableSems = await query<{ semester: number }>(
            `SELECT DISTINCT COALESCE(semester, $2) as semester 
             FROM student_subjects WHERE student_id = $1 
             ORDER BY semester`,
            [studentId, studentInfo[0].current_semester]
        );

        const student = studentInfo[0];
        const overall = overallStats[0] || { total_classes: '0', attended: '0', attendance_pct: '0' };

        return NextResponse.json({
            student: {
                id: student.id,
                studentId: student.student_id,
                rollNumber: student.roll_number,
                name: `${student.first_name} ${student.last_name}`,
                email: student.email || 'N/A',
                department: student.department_name || 'N/A',
                semester: student.current_semester
            },
            summary: {
                totalClasses: parseInt(overall.total_classes) || 0,
                attended: parseInt(overall.attended) || 0,
                attendancePercentage: Math.round(parseFloat(overall.attendance_pct) || 0)
            },
            subjects: subjectStats.map(s => ({
                id: s.subject_id,
                name: s.subject_name,
                code: s.subject_code,
                paperCode: s.subject_paper_code || null,
                totalClasses: parseInt(s.total_classes) || 0,
                attended: parseInt(s.attended) || 0,
                attendance: Math.round(parseFloat(s.attendance_pct) || 0)
            })),
            monthlyTrend: monthlyStats.map(m => ({
                month: m.month,
                totalClasses: parseInt(m.total_classes) || 0,
                attended: parseInt(m.attended) || 0,
                attendance: Math.round(parseFloat(m.attendance_pct) || 0)
            })),

            // Include the date range in response for reference
            dateRange: startDate && endDate ? { startDate, endDate } : null,

            // Include reportSemester so frontend knows which semester is being viewed
            reportSemester: targetSemester || student.current_semester,

            // Available semesters this student has subject data for (for history dropdown)
            availableSemesters: availableSems.map(r => r.semester).filter(Boolean).sort((a, b) => a - b)
        });
    } catch (error) {
        console.error('Student detail error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
