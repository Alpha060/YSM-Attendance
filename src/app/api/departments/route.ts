import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface DepartmentRow {
    id: string;
    name: string;
    code: string;
    dept_type: string;
    degree_type: string;
    hod_name: string | null;
    created_at: Date;
}

// GET - List all departments
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

        let departments;
        if (payload.role === 'super_admin') {
            departments = await query<DepartmentRow>(
                `SELECT d.id, d.name, d.code, d.dept_type, d.degree_type, d.created_at,
                        (
                            SELECT CONCAT(u.first_name, ' ', u.last_name)
                            FROM users u
                            LEFT JOIN user_departments ud ON u.id = ud.user_id AND ud.role = 'hod'
                            WHERE (u.role = 'hod' AND u.department_id = d.id) OR (ud.department_id = d.id AND ud.role = 'hod')
                            LIMIT 1
                        ) as hod_name
                 FROM departments d
                 ORDER BY d.name ASC`
            );
        } else {
            departments = await query<DepartmentRow>(
                `SELECT d.id, d.name, d.code, d.dept_type, d.degree_type, d.created_at,
                        (
                            SELECT CONCAT(u.first_name, ' ', u.last_name)
                            FROM users u
                            LEFT JOIN user_departments ud ON u.id = ud.user_id AND ud.role = 'hod'
                            WHERE (u.role = 'hod' AND u.department_id = d.id) OR (ud.department_id = d.id AND ud.role = 'hod')
                            LIMIT 1
                        ) as hod_name
                 FROM departments d
                 WHERE d.id IN (
                     SELECT department_id FROM user_departments WHERE user_id = $1 AND role = 'hod'
                     UNION
                     SELECT department_id FROM users WHERE id = $1 AND role = 'hod'
                 )
                 ORDER BY d.name ASC`,
                 [(payload as any).userId || (payload as any).id]
            );
        }

        return NextResponse.json({ departments });
    } catch (error) {
        console.error('Get departments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create department (super_admin only)
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

        if (payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const name = body.name?.trim();
        const code = body.code?.trim();
        const deptType = body.deptType?.trim();

        if (!name || !code || !deptType) {
            return NextResponse.json(
                { error: 'Name, code, and department type are required' },
                { status: 400 }
            );
        }

        if (name.length > 100 || code.length > 20) {
            return NextResponse.json(
                { error: 'Name must be under 100 characters, code under 20' },
                { status: 400 }
            );
        }

        if (!['regular', 'vocational', 'pg'].includes(deptType)) {
            return NextResponse.json(
                { error: 'Invalid department type. Must be regular, vocational, or pg' },
                { status: 400 }
            );
        }

        const departments = await query<DepartmentRow>(
            `INSERT INTO departments (name, code, dept_type)
             VALUES ($1, $2, $3)
             RETURNING *, NULL as hod_name`,
            [name, code.toUpperCase(), deptType]
        );

        return NextResponse.json({ department: departments[0] }, { status: 201 });
    } catch (error: unknown) {
        console.error('Create department error:', error);
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json(
                { error: 'Department name or code already exists' },
                { status: 400 }
            );
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update department (super_admin only)
export async function PUT(request: NextRequest) {
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

        if (payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, name, code, deptType } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Department ID required' }, { status: 400 });
        }

        const updateFields: string[] = [];
        const params: (string | number)[] = [id];
        let paramCount = 1;

        if (name) { updateFields.push(`name = $${++paramCount}`); params.push(name); }
        if (code) { updateFields.push(`code = $${++paramCount}`); params.push(code.toUpperCase()); }
        if (deptType) {
            if (!['regular', 'vocational', 'pg'].includes(deptType)) {
                return NextResponse.json({ error: 'Invalid department type' }, { status: 400 });
            }
            updateFields.push(`dept_type = $${++paramCount}`);
            params.push(deptType);
        }

        if (updateFields.length === 0) {
            return NextResponse.json({ message: 'No fields to update' });
        }

        await query(
            `UPDATE departments SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            params
        );

        return NextResponse.json({ message: 'Department updated successfully' });
    } catch (error: unknown) {
        console.error('Update department error:', error);
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json(
                { error: 'Department name or code already exists' },
                { status: 400 }
            );
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Delete department (super_admin only)
export async function DELETE(request: NextRequest) {
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

        if (payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Department ID required' }, { status: 400 });
        }

        // Check for related records
        const subjectsCheck = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM subjects WHERE department_id = $1',
            [id]
        );
        if (parseInt(subjectsCheck[0].count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete department with existing subjects' },
                { status: 400 }
            );
        }

        const studentsCheck = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM students WHERE department_id = $1',
            [id]
        );
        if (parseInt(studentsCheck[0].count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete department with existing students' },
                { status: 400 }
            );
        }

        const teachersCheck = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM users WHERE department_id = $1 AND role IN (\'teacher\', \'hod\')',
            [id]
        );
        if (parseInt(teachersCheck[0].count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete department with existing teachers' },
                { status: 400 }
            );
        }

        await query('DELETE FROM departments WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Delete department error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
