-- ==============================================================================
-- Teachease – Supabase Database Migration
-- Feature: Session-Based Attendance & Profile Persistence Fixes
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Ensure UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Attendance Sessions Table (Multiple Sessions on Same Day)
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    year TEXT NOT NULL,
    branch TEXT NOT NULL,
    division TEXT DEFAULT 'Div A',
    session_number TEXT NOT NULL DEFAULT 'Session 1',
    session_type TEXT NOT NULL DEFAULT 'Lecture',
    start_time TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Upgrade public.attendance Table to link to attendance_sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance' 
        AND column_name = 'session_id'
    ) THEN
        ALTER TABLE public.attendance ADD COLUMN session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Enable Row Level Security (RLS) on attendance_sessions
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Add RLS Policies for attendance_sessions
DROP POLICY IF EXISTS "Allow authenticated view of attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Allow authenticated view of attendance_sessions" 
ON public.attendance_sessions FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow teachers to manage attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Allow teachers to manage attendance_sessions" 
ON public.attendance_sessions FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 6. Fix RLS on profiles to allow INSERT during registration
DROP POLICY IF EXISTS "Allow public insert of profiles" ON public.profiles;
CREATE POLICY "Allow public insert of profiles" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public upsert of profiles" ON public.profiles;
CREATE POLICY "Allow public upsert of profiles" 
ON public.profiles FOR UPDATE 
USING (true);

-- 7. Fix RLS on teachers table
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of teachers" ON public.teachers;
CREATE POLICY "Allow public read of teachers" 
ON public.teachers FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow teachers to insert teachers profile" ON public.teachers;
CREATE POLICY "Allow teachers to insert teachers profile" 
ON public.teachers FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow teachers to update teachers profile" ON public.teachers;
CREATE POLICY "Allow teachers to update teachers profile" 
ON public.teachers FOR UPDATE 
USING (true);

-- 8. Add Unique constraint on (session_id, student_id) in attendance if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_student_session'
    ) THEN
        ALTER TABLE public.attendance 
        ADD CONSTRAINT unique_student_session UNIQUE (session_id, student_id);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- If duplicate rows already exist in attendance, log notice
        RAISE NOTICE 'Could not add unique_student_session constraint immediately due to existing records.';
END $$;

-- 9. Storage bucket for student-photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage bucket access policies
DROP POLICY IF EXISTS "Public Access to student-photos" ON storage.objects;
CREATE POLICY "Public Access to student-photos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Allow Upload to student-photos" ON storage.objects;
CREATE POLICY "Allow Upload to student-photos" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Allow Update in student-photos" ON storage.objects;
CREATE POLICY "Allow Update in student-photos" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'student-photos');
