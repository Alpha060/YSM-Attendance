import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface DepartmentRow {
    id: string;
    name: string;
    code: string;
    dept_type: string;
}

// GET - Fetch only the authenticated user's departments (primary + additional)
// This replaces the heavy GET /api/teachers call that returned ALL teachers
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

        // Single query: Get primary department + all additional departments with roles
        const departments = await query<DepartmentRow & { degree_type: string, department_role: string }>(
            `SELECT d.id, d.name, d.code, d.dept_type, d.degree_type, u.role as department_role
             FROM departments d
             JOIN users u ON u.id = $1
             WHERE d.id = u.department_id
             UNION
             SELECT d.id, d.name, d.code, d.dept_type, d.degree_type, ud.role as department_role
             FROM departments d
             JOIN user_departments ud ON d.id = ud.department_id
             WHERE ud.user_id = $1`,
            [payload.userId]
        );

        return NextResponse.json({
            departments: departments.map(d => ({
                id: d.id,
                name: d.name,
                code: d.code,
                deptType: d.dept_type,
                degreeType: d.degree_type,
                role: d.department_role || 'teacher'
            }))
        });
    } catch (error) {
        console.error('Get user departments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
