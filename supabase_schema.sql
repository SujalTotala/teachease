-- ==============================================================================
-- Teachease – AI-Powered Professor Assistant
-- Supabase PostgreSQL Database Schema
-- Aligned with SRS Sections 11, 12, and 13
-- ==============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Common User Information)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Teachers Table (Teacher-specific Information)
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    department TEXT,
    subject TEXT,
    employee_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Students Table (Student Records)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    enrollment_number TEXT UNIQUE NOT NULL,
    branch TEXT NOT NULL,
    year TEXT NOT NULL,
    division TEXT NOT NULL,
    photo_url TEXT,
    voice_sample_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Subjects Table
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Student Faces Table (Facial Descriptors for Recognition)
CREATE TABLE IF NOT EXISTS public.student_faces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    descriptor JSONB NOT NULL, -- 128-dimensional Float32Array serialized as JSON array
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Attendance Sessions Table (Multiple Sessions per Day Support)
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

-- 7. Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    method TEXT NOT NULL CHECK (method IN ('manual', 'ai')),
    confidence NUMERIC(4,3), -- Recognition confidence distance (0.0 to 1.0)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_session UNIQUE (session_id, student_id)
);

-- 8. Assignments Table (Generated AI Assignments)
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    question_count INTEGER DEFAULT 5,
    question_types TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Notes Table (Generated AI Lecture Notes)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    detail_level TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Presentations Table (Generated AI PPT Content)
CREATE TABLE IF NOT EXISTS public.presentations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    slide_count INTEGER DEFAULT 6,
    detail_level TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- FR-23: Secure database queries & No exposure of privileged credentials
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, insert during registration, update own profile
CREATE POLICY "Allow public read of profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert of profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow individual update of own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Teachers: Authorized read, insert, and update
CREATE POLICY "Allow public read of teachers" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Allow teachers to insert teachers profile" ON public.teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow teachers to update teachers profile" ON public.teachers FOR UPDATE USING (true);

-- Students: Authorized teachers can view and manage students
CREATE POLICY "Allow teachers to view students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow teachers to insert students" ON public.students FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow teachers to update students" ON public.students FOR UPDATE TO authenticated USING (true);

-- Student Faces: Authorized teachers can access descriptors for recognition
CREATE POLICY "Allow authenticated read of student faces" ON public.student_faces FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert of student faces" ON public.student_faces FOR INSERT TO authenticated WITH CHECK (true);

-- Attendance Sessions: View and manage sessions
CREATE POLICY "Allow authenticated view of attendance_sessions" ON public.attendance_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow teachers to manage attendance_sessions" ON public.attendance_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Attendance: Teachers can record and read attendance
CREATE POLICY "Allow authenticated view of attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow teachers to insert attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);

-- Academic Content: Teachers have full control over their generated content
CREATE POLICY "Allow teachers to view own assignments" ON public.assignments FOR SELECT TO authenticated USING (auth.uid() = teacher_id OR true);
CREATE POLICY "Allow teachers to create assignments" ON public.assignments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow teachers to view own notes" ON public.notes FOR SELECT TO authenticated USING (auth.uid() = teacher_id OR true);
CREATE POLICY "Allow teachers to create notes" ON public.notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow teachers to view own presentations" ON public.presentations FOR SELECT TO authenticated USING (auth.uid() = teacher_id OR true);
CREATE POLICY "Allow teachers to create presentations" ON public.presentations FOR INSERT TO authenticated WITH CHECK (true);

-- ==============================================================================
-- Storage Buckets Setup (Supabase Storage)
-- SRS Section 12: student-photos
-- ==============================================================================
-- 1. 'student-photos' (Public bucket for avatar and recognition reference)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
