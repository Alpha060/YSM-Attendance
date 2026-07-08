import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || !['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        if (payload.role === 'hod') {
            const check = await query<any>('SELECT department_id FROM holidays WHERE id = $1', [id]);
            if (check.length === 0) {
                return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
            }
            const owned = await query(
                `SELECT 1 FROM user_departments WHERE user_id = $1 AND department_id = $2 AND role = 'hod'
                 UNION
                 SELECT 1 FROM users WHERE id = $1 AND department_id = $2 AND role = 'hod'`,
                [payload.userId, check[0].department_id]
            );
            if (owned.length === 0) {
                return NextResponse.json({ error: 'Cannot delete global or other department holidays' }, { status: 403 });
            }
        }

        await query('DELETE FROM holidays WHERE id = $1', [id]);
        return NextResponse.json({ message: 'Holiday deleted' });
    } catch (error) {
        console.error('Delete holiday error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
