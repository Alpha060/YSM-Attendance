-- College Attendance System Database Schema (Simplified)
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Departments Table (with dept_type and degree_type)
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    dept_type VARCHAR(20) NOT NULL DEFAULT 'regular' CHECK (dept_type IN ('regular', 'vocational', 'pg')),
    degree_type VARCHAR(20) NOT NULL DEFAULT 'ba' CHECK (degree_type IN ('ba', 'bsc', 'bcom', 'bca', 'it', 'bba', 'mcom')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table (Admin, HOD, Teachers)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'hod', 'teacher')),
    department_id UUID REFERENCES departments(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Students Table (direct link to department)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR(50) UNIQUE,
    roll_number INTEGER NOT NULL,
    roll_number_old VARCHAR(50),
    smart_card_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    department_id UUID REFERENCES departments(id),
    current_semester INTEGER NOT NULL DEFAULT 1,
    batch_year INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subjects Table (linked to degree_type, not department)
-- Departments are for Teachers/Students/HOD, Subjects are for Degree Programs
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL,
    paper_code VARCHAR(20),
    name VARCHAR(200) NOT NULL,
    degree_type VARCHAR(20) NOT NULL CHECK (degree_type IN ('ba', 'bsc', 'bcom', 'bca', 'it', 'bba', 'mcom')),
    credits INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, degree_type)
);

-- Subject-Semester Mapping (One subject can be taught in multiple semesters)
CREATE TABLE IF NOT EXISTS subject_semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 8),
    UNIQUE(subject_id, semester)
);

-- Teacher-Subject Assignment (One teacher per subject)
CREATE TABLE IF NOT EXISTS teacher_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, subject_id, academic_year)
);

-- Student-Subject Enrollment (Students manually select subjects)
CREATE TABLE IF NOT EXISTS student_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL,
    semester INTEGER DEFAULT 1,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT student_subjects_unique_with_semester UNIQUE(student_id, subject_id, academic_year, semester)
);

-- Attendance Records (Per-lecture attendance)
-- Unique constraint includes teacher_id and semester to support multiple teachers
-- and same subject taught across different semesters
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    lecture_number INTEGER NOT NULL DEFAULT 1,
    semester INTEGER DEFAULT 1,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    topic VARCHAR(255),
    remarks VARCHAR(255),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT attendance_records_unique_with_semester UNIQUE(subject_id, student_id, teacher_id, date, lecture_number, semester)
);

-- Holidays Table
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User-Department Assignments (for teachers teaching in multiple departments)
CREATE TABLE IF NOT EXISTS user_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, department_id)
);

-- Application Settings
CREATE TABLE IF NOT EXISTS application_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Performance Indexes
-- ============================================================

-- Students table
CREATE INDEX IF NOT EXISTS idx_students_department_id ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_current_semester ON students(current_semester);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);

-- Student-subjects table
CREATE INDEX IF NOT EXISTS idx_student_subjects_subject_id ON student_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_semester ON student_subjects(semester);

-- Attendance records table
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date ON attendance_records(teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_date ON attendance_records(subject_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_student_date ON attendance_records(subject_id, student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_semester ON attendance_records(semester);
CREATE INDEX IF NOT EXISTS idx_attendance_session_count ON attendance_records(date, subject_id, semester, lecture_number);

-- Teacher-subjects table
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_id ON teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_id ON teacher_subjects(subject_id);

-- ============================================================
-- Class Schedule Tables
-- ============================================================

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

-- Class schedule indexes
CREATE INDEX IF NOT EXISTS idx_class_time_slots_dept ON class_time_slots(department_id);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_dept_date ON daily_class_assignments(department_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_teacher_date ON daily_class_assignments(teacher_id, date);
