import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get('departmentId');
        // Legacy support
        const deptType = searchParams.get('deptType');

        if (departmentId) {
            // New: per-department config
            const rows = await query<{ value: any }>(
                `SELECT value FROM application_settings WHERE key = $1`,
                [`batch_mapping_dept_${departmentId}`]
            );

            if (rows.length > 0) {
                return NextResponse.json({ mappings: rows[0].value });
            }

            // Fallback: try old dept_type config
            const deptRows = await query<{ dept_type: string }>(
                `SELECT dept_type FROM departments WHERE id = $1`, [departmentId]
            );
            if (deptRows.length > 0) {
                const fallbackRows = await query<{ value: any }>(
                    `SELECT value FROM application_settings WHERE key = $1`,
                    [`batch_mapping_${deptRows[0].dept_type}`]
                );
                if (fallbackRows.length > 0) {
                    return NextResponse.json({ mappings: fallbackRows[0].value });
                }
            }

            return NextResponse.json({ mappings: {} });
        }

        // Legacy: dept_type based
        if (deptType) {
            const settingKey = `batch_mapping_${deptType}`;
            const rows = await query<{ value: any }>(
                `SELECT value FROM application_settings WHERE key = $1`,
                [settingKey]
            );
            return NextResponse.json({ mappings: rows.length > 0 ? rows[0].value : {} });
        }

        return NextResponse.json({ mappings: {} });

    } catch (error) {
        console.error('Fetch batch mappings error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

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
        const { mappings, fullConfig, departmentIds } = body;

        if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
            return NextResponse.json({ error: 'Please select at least one department' }, { status: 400 });
        }

        // HOD security: verify they have access to all requested departments
        if (payload.role === 'hod') {
            const accessRows = await query<{ department_id: string }>(
                `SELECT department_id FROM users WHERE id = $1
                 UNION SELECT department_id FROM user_departments WHERE user_id = $1`,
                [payload.userId]
            );
            const allowedIds = new Set(accessRows.map(r => r.department_id));
            for (const deptId of departmentIds) {
                if (!allowedIds.has(deptId)) {
                    return NextResponse.json({ error: 'Access denied to department' }, { status: 403 });
                }
            }
        }

        let totalUpdated = 0;

        if (Array.isArray(mappings) && mappings.length > 0) {
            for (const mapping of mappings) {
                const { semester, batchYear } = mapping;
                if (typeof semester !== 'number' || typeof batchYear !== 'number') continue;

                // Update students only in the selected departments
                const deptPlaceholders = departmentIds.map((_: string, i: number) => `$${3 + i}`).join(', ');
                const params: (string | number)[] = [semester, batchYear, ...departmentIds];

                const result = await query(
                    `UPDATE students 
                     SET current_semester = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE batch_year = $2 
                     AND department_id IN (${deptPlaceholders})
                     RETURNING id`,
                    params
                );
                totalUpdated += result.length;
            }
        }
        
        // Save config per department
        const mappingObject: Record<string, number | null> = {};
        if (fullConfig && typeof fullConfig === 'object') {
            Object.assign(mappingObject, fullConfig);
        } else if (Array.isArray(mappings)) {
            for (const m of mappings) {
                mappingObject[m.semester.toString()] = m.batchYear;
            }
        }

        // Save separately for each selected department
        for (const deptId of departmentIds) {
            const settingKey = `batch_mapping_dept_${deptId}`;
            await query(
                `INSERT INTO application_settings (key, value, updated_at) 
                 VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) 
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
                [settingKey, JSON.stringify(mappingObject)]
            );
        }

        return NextResponse.json({ 
            message: 'Batch upgrade successful',
            updatedCount: totalUpdated
        });

    } catch (error) {
        console.error('Batch upgrade error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
