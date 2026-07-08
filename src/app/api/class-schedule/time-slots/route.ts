import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Fetch time slots for a department
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

        if (!departmentId) {
            return NextResponse.json({ error: 'departmentId required' }, { status: 400 });
        }

        const slots = await query<{
            slot_number: number;
            start_time: string;
            end_time: string;
        }>(
            `SELECT slot_number, start_time::text, end_time::text
             FROM class_time_slots
             WHERE department_id = $1
             ORDER BY slot_number`,
            [departmentId]
        );

        return NextResponse.json({ slots });
    } catch (error) {
        console.error('Get time slots error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Upsert time slots for a department
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

        const { departmentId, slots } = await request.json();

        if (!departmentId || !slots || !Array.isArray(slots)) {
            return NextResponse.json({ error: 'departmentId and slots array required' }, { status: 400 });
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

        // Upsert each slot
        for (const slot of slots) {
            if (!slot.slotNumber || !slot.startTime || !slot.endTime) continue;
            if (slot.slotNumber < 1 || slot.slotNumber > 6) continue;

            await query(
                `INSERT INTO class_time_slots (department_id, slot_number, start_time, end_time, updated_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (department_id, slot_number)
                 DO UPDATE SET start_time = $3, end_time = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP`,
                [departmentId, slot.slotNumber, slot.startTime, slot.endTime, payload.userId]
            );
        }

        return NextResponse.json({ message: 'Time slots saved successfully' });
    } catch (error) {
        console.error('Save time slots error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
