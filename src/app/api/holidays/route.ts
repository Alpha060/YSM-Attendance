import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface HolidayRow {
    id: string;
    name: string;
    date: string;
    description: string | null;
    department_id: string | null;
}

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

        try {
            let queryStr = 'SELECT id, name, date, description, department_id FROM holidays';
            const params: any[] = [];

            if (payload.role === 'hod') {
                queryStr += ` WHERE department_id IS NULL OR department_id IN (
                    SELECT department_id FROM users WHERE id = $1 AND role = 'hod'
                    UNION
                    SELECT department_id FROM user_departments WHERE user_id = $1 AND role = 'hod'
                )`;
                params.push(payload.userId);
            } else if (payload.role === 'teacher') {
                queryStr += ` WHERE department_id IS NULL OR department_id IN (
                    SELECT department_id FROM users WHERE id = $1
                    UNION
                    SELECT department_id FROM user_departments WHERE user_id = $1
                )`;
                params.push(payload.userId);
            }
            
            queryStr += ' ORDER BY date ASC';

            const holidays = await query<HolidayRow>(queryStr, params);
            return NextResponse.json({ holidays });
        } catch (err) {
            console.error('Holidays query error:', err);
            return NextResponse.json({ holidays: [] });
        }
    } catch (error) {
        console.error('Get holidays error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create holiday
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

        const { name, date, description, departmentId: reqDeptId } = await request.json();

        if (!name || !date) {
            return NextResponse.json({ error: 'Name and date are required' }, { status: 400 });
        }

        let departmentId = null;
        if (payload.role === 'hod') {
            departmentId = reqDeptId || payload.departmentId;
            const owned = await query(
                `SELECT 1 FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'
                 UNION
                 SELECT 1 FROM users WHERE id = $1 AND department_id = $2 AND role = 'hod'`,
                [payload.userId, departmentId]
            );
            if (owned.length === 0) {
                return NextResponse.json({ error: 'Access denied for this department' }, { status: 403 });
            }
        }

        const holidays = await query<HolidayRow>(
            `INSERT INTO holidays (name, date, description, department_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, date, description || null, departmentId]
        );

        return NextResponse.json({ holiday: holidays[0] }, { status: 201 });
    } catch (error) {
        console.error('Create holiday error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
