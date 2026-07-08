import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Fetch assignments for a department on a date
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = verifyToken(authHeader.split(' ')[1]);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get('departmentId');
        const date = searchParams.get('date');

        if (!date) {
            return NextResponse.json({ error: 'date required' }, { status: 400 });
        }

        let queryStr = `SELECT 
                dca.department_id, dca.id, dca.semester, dca.slot_number, dca.teacher_id, dca.subject_id,
                u.first_name as teacher_first_name, u.last_name as teacher_last_name,
                s.name as subject_name, s.code as subject_code, s.paper_code
             FROM daily_class_assignments dca
             JOIN users u ON dca.teacher_id = u.id
             JOIN subjects s ON dca.subject_id = s.id
             WHERE dca.date = $1`;
             
        const params: any[] = [date];
        let paramIndex = 2;

        if (payload.role === 'hod') {
            if (departmentId) {
                queryStr += ` AND dca.department_id = $${paramIndex} AND dca.department_id IN (
                    SELECT department_id FROM user_departments WHERE user_id = $${paramIndex + 1} AND role = 'hod'
                    UNION
                    SELECT department_id FROM users WHERE id = $${paramIndex + 1} AND role = 'hod'
                )`;
                params.push(departmentId, payload.userId);
                paramIndex += 2;
            } else {
                queryStr += ` AND dca.department_id IN (
                    SELECT department_id FROM user_departments WHERE user_id = $${paramIndex} AND role = 'hod'
                    UNION
                    SELECT department_id FROM users WHERE id = $${paramIndex} AND role = 'hod'
                )`;
                params.push(payload.userId);
                paramIndex++;
            }
        } else if (departmentId) {
            queryStr += ` AND dca.department_id = $${paramIndex}`;
            params.push(departmentId);
            paramIndex++;
        }
        
        queryStr += ` ORDER BY dca.department_id, dca.semester, dca.slot_number`;

        const assignments = await query<{
            department_id: string;
            id: string;
            semester: number;
            slot_number: number;
            teacher_id: string;
            subject_id: string;
            teacher_first_name: string;
            teacher_last_name: string;
            subject_name: string;
            subject_code: string;
            paper_code: string | null;
        }>(queryStr, params);

        return NextResponse.json({ assignments });
    } catch (error) {
        console.error('Get assignments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Upsert a single assignment (or batch)
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = verifyToken(authHeader.split(' ')[1]);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { departmentId, date, assignments } = await request.json();

        if (!departmentId || !date || !assignments || !Array.isArray(assignments)) {
            return NextResponse.json({ error: 'departmentId, date, and assignments required' }, { status: 400 });
        }

        // Block assignments on Sundays
        const assignDate = new Date(date + 'T00:00:00');
        if (assignDate.getDay() === 0) {
            return NextResponse.json({ error: 'Cannot assign classes on Sunday' }, { status: 400 });
        }

        // Block assignments on holidays
        const holidayCheck = await query<{ id: string }>(
            `SELECT id FROM holidays
             WHERE date = $1 AND (department_id IS NULL OR department_id = $2)
             LIMIT 1`,
            [date, departmentId]
        );
        if (holidayCheck.length > 0) {
            return NextResponse.json({ error: 'Cannot assign classes on a holiday' }, { status: 400 });
        }

        // HOD must own the department
        if (payload.role === 'hod') {
            const owned = await query<{ department_id: string }>(
                `SELECT department_id FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'
                 UNION
                 SELECT department_id FROM users WHERE id = $1 AND department_id = $2 AND role = 'hod'`,
                [payload.userId, departmentId]
            );
            if (owned.length === 0) {
                return NextResponse.json({ error: 'Access denied for this department' }, { status: 403 });
            }
        }

        let upsertCount = 0;
        for (const a of assignments) {
            if (!a.semester || !a.slotNumber || !a.teacherId || !a.subjectId) continue;

            await query(
                `INSERT INTO daily_class_assignments (department_id, semester, slot_number, teacher_id, subject_id, date, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (department_id, semester, slot_number, date)
                 DO UPDATE SET teacher_id = $4, subject_id = $5, created_by = $7, created_at = CURRENT_TIMESTAMP`,
                [departmentId, a.semester, a.slotNumber, a.teacherId, a.subjectId, date, payload.userId]
            );
            upsertCount++;
        }

        return NextResponse.json({ message: `${upsertCount} assignment(s) saved`, count: upsertCount });
    } catch (error) {
        console.error('Save assignments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Remove a specific assignment or all for dept+date
export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = verifyToken(authHeader.split(' ')[1]);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get('departmentId');
        const date = searchParams.get('date');
        const semester = searchParams.get('semester');
        const slotNumber = searchParams.get('slotNumber');

        if (!departmentId || !date) {
            return NextResponse.json({ error: 'departmentId and date required' }, { status: 400 });
        }

        // HOD must own the department
        if (payload.role === 'hod') {
            const owned = await query<{ department_id: string }>(
                `SELECT department_id FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'
                 UNION
                 SELECT department_id FROM users WHERE id = $1 AND department_id = $2 AND role = 'hod'`,
                [payload.userId, departmentId]
            );
            if (owned.length === 0) {
                return NextResponse.json({ error: 'Access denied for this department' }, { status: 403 });
            }
        }

        if (semester && slotNumber) {
            // Delete specific cell
            await query(
                `DELETE FROM daily_class_assignments
                 WHERE department_id = $1 AND date = $2 AND semester = $3 AND slot_number = $4`,
                [departmentId, date, parseInt(semester), parseInt(slotNumber)]
            );
        } else {
            // Clear all assignments for dept + date
            await query(
                `DELETE FROM daily_class_assignments WHERE department_id = $1 AND date = $2`,
                [departmentId, date]
            );
        }

        return NextResponse.json({ message: 'Assignment(s) deleted' });
    } catch (error) {
        console.error('Delete assignments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
