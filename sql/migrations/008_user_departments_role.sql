-- Add role column to user_departments to support user role isolation per department
ALTER TABLE user_departments ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'teacher' CHECK (role IN ('hod', 'teacher'));
