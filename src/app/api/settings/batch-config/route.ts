import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET batch mappings for any authenticated user (for batch label display)
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }

        // Get all batch mappings — both new per-dept and old per-deptType
        const rows = await query<{ key: string, value: any }>(
            `SELECT key, value FROM application_settings WHERE key LIKE 'batch_mapping_%'`
        );

        // Build result: prefer per-department configs, fallback to per-deptType
        const result: Record<string, any> = {};
        const deptConfigs: Record<string, any> = {};
        const typeConfigs: Record<string, any> = {};

        rows.forEach(row => {
            if (row.key.startsWith('batch_mapping_dept_')) {
                // Per-department config: batch_mapping_dept_{departmentId}
                const deptId = row.key.replace('batch_mapping_dept_', '');
                deptConfigs[deptId] = row.value;
            } else {
                // Legacy per-type config: batch_mapping_regular, batch_mapping_vocational, etc.
                const deptType = row.key.replace('batch_mapping_', '');
                typeConfigs[deptType] = row.value;
            }
        });

        // Get all departments to map dept_id -> dept_type for consumers
        const depts = await query<{ id: string, dept_type: string }>(
            `SELECT id, dept_type FROM departments`
        );

        // For each department: use per-dept config if exists, else fall back to dept_type config
        for (const dept of depts) {
            if (deptConfigs[dept.id]) {
                // Per-department config exists — use dept_type as key for backward compat
                // but mark this config per department
                if (!result[dept.dept_type]) {
                    result[dept.dept_type] = deptConfigs[dept.id];
                }
            }
        }

        // Fill in any dept_types that don't have per-dept configs yet (legacy)
        for (const [type, config] of Object.entries(typeConfigs)) {
            if (!result[type]) {
                result[type] = config;
            }
        }

        return NextResponse.json({ 
            mappings: result,
            // Also return per-department mappings for consumers that need it
            departmentMappings: deptConfigs
        });

    } catch (error) {
        console.error('Fetch batch config error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
