import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';

interface TeacherRow {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    department_id: string | null;
    department_name?: string;
    department_code?: string;
}

interface DepartmentInfo {
    id: string;
    name: string;
    code: string;
    dept_type?: string;
    is_primary: boolean;
    role?: string;
}

// GET - List teachers
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

        // Query teachers with their primary department and subjects
        let queryText = `
            SELECT 
                u.id, u.email, u.first_name, u.last_name, u.role, u.department_id, u.created_at, u.updated_at,
                d.name as department_name, 
                d.code as department_code,
                d.dept_type as department_dept_type,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'assignmentId', ts.id,
                        'subjectId', s.id,
                        'code', s.code, 
                        'paperCode', s.paper_code,
                        'name', s.name, 
                        'degreeType', s.degree_type,
                        'semesters', (SELECT COALESCE(array_agg(ss.semester ORDER BY ss.semester), ARRAY[]::integer[]) FROM subject_semesters ss WHERE ss.subject_id = s.id)
                    )), '[]'::json)
                    FROM teacher_subjects ts
                    JOIN subjects s ON ts.subject_id = s.id
                    WHERE ts.teacher_id = u.id
                ) as subjects,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', dept.id,
                        'name', dept.name,
                        'code', dept.code,
                        'dept_type', dept.dept_type,
                        'is_primary', false,
                        'role', ud.role
                    )), '[]'::json)
                    FROM user_departments ud
                    JOIN departments dept ON ud.department_id = dept.id
                    WHERE ud.user_id = u.id AND (u.department_id IS NULL OR ud.department_id != u.department_id)
                ) as additional_departments
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.role IN ('teacher', 'hod')
        `;
        const params: string[] = [];

        // HODs can see teachers from their assigned departments (where they are HOD)
        if (payload.role === 'hod' && payload.userId) {
            queryText += ` AND (
                u.department_id IN (SELECT department_id FROM user_departments WHERE user_id = $1 AND role = 'hod')
                OR u.department_id = $2
                OR EXISTS (
                    SELECT 1 FROM user_departments ud 
                    WHERE ud.user_id = u.id AND (
                        ud.department_id IN (SELECT department_id FROM user_departments WHERE user_id = $1 AND role = 'hod')
                        OR ud.department_id = $2
                    )
                )
            )`;
            params.push(payload.userId, payload.departmentId || '00000000-0000-0000-0000-000000000000');
        }

        queryText += ' ORDER BY u.first_name, u.last_name';

        const teachers = await query<TeacherRow & { subjects: any[]; additional_departments: DepartmentInfo[] }>(queryText, params);

        // Transform response to include all departments in a single array
        const transformedTeachers = teachers.map(teacher => {
            const allDepartments: DepartmentInfo[] = [];

            // Add primary department first
            if (teacher.department_id && teacher.department_name && teacher.department_code) {
                allDepartments.push({
                    id: teacher.department_id,
                    name: teacher.department_name,
                    code: teacher.department_code,
                    is_primary: true,
                    role: teacher.role
                });
            }

            // Add additional departments
            if (teacher.additional_departments && Array.isArray(teacher.additional_departments)) {
                allDepartments.push(...teacher.additional_departments);
            }

            return {
                ...teacher,
                departments: allDepartments
            };
        });

        return NextResponse.json({ teachers: transformedTeachers });
    } catch (error) {
        console.error('Get teachers error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create teacher
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || !['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { firstName, lastName, email, role, password, departments: requestDepts, departmentIds, departmentId } = body;

        // Support both new `{ id, role }[]` format and legacy `departmentIds` array
        let depts: { id: string; role: string }[] = [];
        if (requestDepts && Array.isArray(requestDepts)) {
            depts = requestDepts;
        } else {
            const ids: string[] = departmentIds || (departmentId ? [departmentId] : []);
            depts = ids.map((id, index) => ({
                id,
                role: index === 0 ? (role || 'teacher') : 'teacher'
            }));
        }

        if (!firstName || !lastName || !email || depts.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const primaryDeptId = depts[0].id;
        const primaryRole = depts[0].role;
        const additionalDepts = depts.slice(1);

        // HODs can only create in their department (no multiple departments)
        if (payload.role === 'hod') {
            const isHodOfDept = payload.departmentId === primaryDeptId || await query(
                "SELECT 1 FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'",
                [payload.userId, primaryDeptId]
            ).then(r => r.length > 0);

            if (!isHodOfDept) {
                return NextResponse.json({ error: 'Can only add teachers to your department' }, { status: 403 });
            }
            if (additionalDepts.length > 0) {
                return NextResponse.json({ error: 'HODs cannot assign teachers to multiple departments' }, { status: 403 });
            }
        }

        // Enforce Single HOD Rule (if promoting to HOD)
        if (primaryRole === 'hod') {
            await query(
                `UPDATE users SET role = 'teacher', updated_at = CURRENT_TIMESTAMP 
                 WHERE department_id = $1 AND role = 'hod'`,
                [primaryDeptId]
            );
        }

        // Use custom password if provided, otherwise default
        const defaultPassword = password || 'Welcome@123';
        const passwordHash = await hashPassword(defaultPassword);

        const teachers = await query<TeacherRow>(
            `INSERT INTO users (first_name, last_name, email, password_hash, role, department_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
             [firstName, lastName, email, passwordHash, primaryRole || 'teacher', primaryDeptId]
        );

        const newTeacher = teachers[0];

        // Add additional departments
        for (const dept of additionalDepts) {
            await query(
                `INSERT INTO user_departments (user_id, department_id, role) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (user_id, department_id) DO UPDATE SET role = EXCLUDED.role`,
                [newTeacher.id, dept.id, dept.role || 'teacher']
            );
        }

        return NextResponse.json({
            teacher: newTeacher,
            temporaryPassword: defaultPassword,
        }, { status: 201 });
    } catch (error: unknown) {
        console.error('Create teacher error:', error);
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Remove teacher
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

        // Only super_admin and hod can delete
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });
        }

        // Check if teacher belongs to HOD's department (primary or additional)
        if (payload.role === 'hod') {
            const teacher = await query<{ department_id: string }>(
                `SELECT department_id FROM users WHERE id = $1
                 UNION
                 SELECT department_id FROM user_departments WHERE user_id = $1`,
                [id]
            );
            const teacherDeptIds = teacher.map(t => t.department_id);
            if (!teacherDeptIds.includes(payload.departmentId!)) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Clean up related records
        await query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [id]);
        await query('DELETE FROM user_departments WHERE user_id = $1', [id]);

        // Unlink teacher from attendance records (preserve history)
        await query('UPDATE attendance_records SET teacher_id = NULL WHERE teacher_id = $1', [id]);

        // Unlink from audit logs if any
        await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]);

        await query('DELETE FROM users WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        console.error('Delete teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update teacher
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

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { id, firstName, lastName, email, role, password, departments: requestDepts, departmentIds, departmentId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });
        }

        // Support both new `{ id, role }[]` format and legacy `departmentIds` array
        let depts: { id: string; role: string }[] = [];
        if (requestDepts && Array.isArray(requestDepts)) {
            depts = requestDepts;
        } else {
            const ids: string[] = departmentIds || (departmentId ? [departmentId] : []);
            depts = ids.map((id, index) => ({
                id,
                role: index === 0 ? (role || 'teacher') : 'teacher'
            }));
        }

        let primaryDeptId = depts.length > 0 ? depts[0].id : null;
        let primaryRole = depts.length > 0 ? depts[0].role : null;
        let additionalDepts = depts.slice(1);

        // HOD restriction check
        if (payload.role === 'hod') {
            const allowedDepts = await query<{ department_id: string }>(
                `SELECT department_id FROM users WHERE id = $1 AND role = 'hod'
                 UNION
                 SELECT department_id FROM user_departments WHERE user_id = $1 AND role = 'hod'`,
                [payload.userId]
            );
            const allowedDeptIds = allowedDepts.map(d => d.department_id);

            const teacherDepts = await query<{ department_id: string }>(
                `SELECT department_id FROM users WHERE id = $1
                 UNION
                 SELECT department_id FROM user_departments WHERE user_id = $1`,
                [id]
            );
            const teacherDeptIds = teacherDepts.map(d => d.department_id);

            const hasOverlap = teacherDeptIds.some(dId => allowedDeptIds.includes(dId));
            if (!hasOverlap) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
            
            // HODs are not allowed to modify teacher departments. Override with existing db values.
            const teacherPrimary = await query<{ department_id: string, role: string }>('SELECT department_id, role FROM users WHERE id = $1', [id]);
            depts = [];
            if (teacherPrimary[0]?.department_id) {
                depts.push({ id: teacherPrimary[0].department_id, role: teacherPrimary[0].role });
            }
            
            const currentAddDepts = await query<{ department_id: string, role: string }>('SELECT department_id, role FROM user_departments WHERE user_id = $1', [id]);
            depts.push(...currentAddDepts.map(d => ({ id: d.department_id, role: d.role })));
            
            primaryDeptId = depts.length > 0 ? depts[0].id : null;
            primaryRole = depts.length > 0 ? depts[0].role : null;
            additionalDepts = depts.slice(1);
        }

        // Enforce Single HOD Rule (if promoting to HOD)
        if (primaryRole === 'hod') {
            let targetDeptId = primaryDeptId;
            if (!targetDeptId) {
                const current = await query<{ department_id: string }>('SELECT department_id FROM users WHERE id = $1', [id]);
                targetDeptId = current[0]?.department_id;
            }

            if (targetDeptId) {
                await query(
                    `UPDATE users SET role = 'teacher', updated_at = CURRENT_TIMESTAMP 
                     WHERE department_id = $1 AND role = 'hod' AND id != $2`,
                    [targetDeptId, id]
                );
            }
        }

        const updateFields: string[] = [];
        const params: (string | boolean)[] = [id];
        let paramCount = 1;

        if (firstName) { updateFields.push(`first_name = $${++paramCount}`); params.push(firstName); }
        if (lastName) { updateFields.push(`last_name = $${++paramCount}`); params.push(lastName); }
        if (email) { updateFields.push(`email = $${++paramCount}`); params.push(email); }
        if (primaryDeptId) { updateFields.push(`department_id = $${++paramCount}`); params.push(primaryDeptId); }
        if (primaryRole) { updateFields.push(`role = $${++paramCount}`); params.push(primaryRole); }
        if (password) {
            const passwordHash = await hashPassword(password);
            updateFields.push(`password_hash = $${++paramCount}`);
            params.push(passwordHash);
        }

        if (updateFields.length > 0) {
            await query(
                `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                params
            );
        }

        // Update additional departments
        if (depts.length > 0) {
            // Remove all additional departments first
            await query('DELETE FROM user_departments WHERE user_id = $1', [id]);

            // Add new additional departments with roles
            for (const dept of additionalDepts) {
                await query(
                    `INSERT INTO user_departments (user_id, department_id, role) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT (user_id, department_id) DO UPDATE SET role = EXCLUDED.role`,
                    [id, dept.id, dept.role || 'teacher']
                );
            }
        }

        return NextResponse.json({ message: 'Teacher updated successfully' });
    } catch (error) {
        console.error('Update teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
