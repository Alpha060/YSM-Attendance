import { Pool } from 'pg';

/**
 * Auto-migration runner for the YSM Attendance system.
 * Runs pending SQL migrations on server startup.
 * Tracks which migrations have been applied via a `_migrations` table.
 */

const MIGRATIONS: { name: string; sql: string }[] = [
    {
        name: '001_add_semester',
        sql: `
            -- Step 1: Add semester column if not exists
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'semester'
                ) THEN
                    ALTER TABLE attendance_records ADD COLUMN semester INTEGER;
                    RAISE NOTICE 'Added semester column to attendance_records';
                END IF;
            END $$;

            -- Step 2: Backfill semester from student's current_semester
            UPDATE attendance_records ar
            SET semester = s.current_semester
            FROM students s
            WHERE ar.student_id = s.id AND ar.semester IS NULL;

            -- Step 3: Set default for future records
            ALTER TABLE attendance_records ALTER COLUMN semester SET DEFAULT 1;

            -- Step 4: Drop old constraint, add new one with semester
            DO $$
            BEGIN
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_subject_id_student_id_teacher_id_date_le_key;
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_unique;
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_unique_v2;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END $$;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'attendance_records_unique_with_semester'
                ) THEN
                    ALTER TABLE attendance_records 
                        ADD CONSTRAINT attendance_records_unique_with_semester 
                        UNIQUE(subject_id, student_id, teacher_id, date, lecture_number, semester);
                END IF;
            END $$;

            -- Step 5: Add indexes
            CREATE INDEX IF NOT EXISTS idx_attendance_semester ON attendance_records(semester);
            CREATE INDEX IF NOT EXISTS idx_attendance_session_count 
                ON attendance_records(date, subject_id, semester, lecture_number);
        `
    },
    {
        name: '002_holidays_department_id',
        sql: `
            -- Add department_id to holidays for department-specific holidays
            ALTER TABLE holidays
            ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;

            -- Drop unique date constraint so multiple departments can have holidays on the same date
            ALTER TABLE holidays
            DROP CONSTRAINT IF EXISTS holidays_date_key;
        `
    },
    {
        name: '003_add_topic_column',
        sql: `
            -- Add optional topic column to attendance_records
            ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS topic VARCHAR(255);
        `
    },
    {
        name: '004_class_schedule',
        sql: `
            -- Class time slots: persists across days (HOD sets once, reused daily)
            CREATE TABLE IF NOT EXISTS class_time_slots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
                slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 6),
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(department_id, slot_number)
            );

            -- Daily class assignments: teacher+subject per semester+slot, resets daily
            CREATE TABLE IF NOT EXISTS daily_class_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
                semester INTEGER NOT NULL,
                slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 6),
                teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
                subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(department_id, semester, slot_number, date)
            );

            -- Indexes for fast lookups
            CREATE INDEX IF NOT EXISTS idx_class_time_slots_dept ON class_time_slots(department_id);
            CREATE INDEX IF NOT EXISTS idx_daily_assignments_dept_date ON daily_class_assignments(department_id, date);
            CREATE INDEX IF NOT EXISTS idx_daily_assignments_teacher_date ON daily_class_assignments(teacher_id, date);
        `
    },
    {
        name: '005_realtime_notify_triggers',
        sql: `
            -- Generic function for real-time NOTIFY on table changes
            CREATE OR REPLACE FUNCTION notify_table_change()
            RETURNS TRIGGER AS $$
            BEGIN
                PERFORM pg_notify(
                    'table_changes',
                    json_build_object('table', TG_TABLE_NAME, 'op', TG_OP)::text
                );
                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            -- Attach triggers to all key tables
            DO $$
            DECLARE
                tbl TEXT;
            BEGIN
                FOR tbl IN
                    SELECT unnest(ARRAY[
                        'students', 'users', 'departments', 'subjects',
                        'student_subjects', 'teacher_subjects', 'teacher_departments',
                        'holidays', 'attendance_records',
                        'class_time_slots', 'daily_class_assignments',
                        'batch_semester_config'
                    ])
                LOOP
                    -- Only add trigger if table exists
                    IF EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_name = tbl AND table_schema = 'public'
                    ) THEN
                        EXECUTE format(
                            'DROP TRIGGER IF EXISTS trg_notify_%I ON %I; ' ||
                            'CREATE TRIGGER trg_notify_%I ' ||
                            'AFTER INSERT OR UPDATE OR DELETE ON %I ' ||
                            'FOR EACH ROW EXECUTE FUNCTION notify_table_change();',
                            tbl, tbl, tbl, tbl
                        );
                    END IF;
                END LOOP;
            END $$;
        `
    },
    {
        name: '006_application_settings',
        sql: `
            -- Settings table for email automation config, etc.
            CREATE TABLE IF NOT EXISTS application_settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `
    },
    {
        name: '007_student_subjects_semester',
        sql: `
            -- Add semester column to student_subjects for historical tracking
            -- This lets us keep old semester subjects intact when students are upgraded
            ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS semester INTEGER;

            -- Backfill semester from student's current_semester
            UPDATE student_subjects ss
            SET semester = s.current_semester
            FROM students s
            WHERE ss.student_id = s.id AND ss.semester IS NULL;

            -- Default to 1 for future inserts if not specified
            ALTER TABLE student_subjects ALTER COLUMN semester SET DEFAULT 1;

            -- Drop old unique constraint and add new one that includes semester
            -- This allows same student+subject in different semesters
            DO $$
            BEGIN
                -- Try dropping old constraints
                ALTER TABLE student_subjects
                    DROP CONSTRAINT IF EXISTS student_subjects_student_id_subject_id_academic_year_key;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END $$;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'student_subjects_unique_with_semester'
                ) THEN
                    ALTER TABLE student_subjects 
                        ADD CONSTRAINT student_subjects_unique_with_semester 
                        UNIQUE(student_id, subject_id, academic_year, semester);
                END IF;
            END $$;

            -- Index for fast semester-based lookups
            CREATE INDEX IF NOT EXISTS idx_student_subjects_semester ON student_subjects(semester);
        `
    },
];

export async function runMigrations() {
    // Prefer direct connection for migrations (triggers/DO blocks may not work through PgBouncer)
    const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

    const isLocalhost =
        dbUrl?.includes('localhost') ||
        dbUrl?.includes('127.0.0.1');

    const pool = new Pool({
        connectionString: dbUrl,
        ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
    });

    const client = await pool.connect();
    try {
        // Create migrations tracking table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check which migrations have been applied
        const applied = await client.query('SELECT name FROM _migrations');
        const appliedNames = new Set(applied.rows.map((r: { name: string }) => r.name));

        for (const migration of MIGRATIONS) {
            if (appliedNames.has(migration.name)) {
                continue; // Already applied
            }

            console.log(`[Migration] Running: ${migration.name}...`);
            try {
                await client.query(migration.sql);
                await client.query(
                    'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
                    [migration.name]
                );
                console.log(`[Migration] ✅ ${migration.name} applied successfully`);
            } catch (err) {
                console.error(`[Migration] ❌ ${migration.name} failed:`, err);
                // Don't throw - let the app continue even if migration fails
            }
        }

        console.log('[Migration] All migrations checked.');
    } catch (err) {
        console.error('[Migration] Migration runner error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}
