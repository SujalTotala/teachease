import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export const isDbConfigured = (): boolean => {
  return Boolean(databaseUrl && databaseUrl.startsWith("postgres"));
};

export const pool = isDbConfigured()
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

// Initialize PostgreSQL schema automatically on startup
export async function initDatabase() {
  if (!pool) {
    console.log("ℹ️ [Database] DATABASE_URL not provided. Server will run in in-memory / fallback mode.");
    return;
  }

  const client = await pool.connect();
  try {
    console.log("🐘 [Database] Connecting to PostgreSQL on Render...");

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS teachers (
        id VARCHAR(100) PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        department TEXT,
        subject TEXT,
        employee_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES profiles(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        enrollment_number TEXT UNIQUE NOT NULL,
        branch TEXT NOT NULL,
        year TEXT NOT NULL,
        division TEXT NOT NULL,
        photo_url TEXT,
        voice_sample_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS student_faces (
        id VARCHAR(100) PRIMARY KEY,
        student_id VARCHAR(100) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        descriptor JSONB NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id VARCHAR(100) PRIMARY KEY,
        teacher_id VARCHAR(100) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        year TEXT NOT NULL,
        branch TEXT NOT NULL,
        division TEXT DEFAULT 'Div A',
        session_number TEXT NOT NULL DEFAULT 'Session 1',
        session_type TEXT NOT NULL DEFAULT 'Lecture',
        start_time TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id VARCHAR(100) PRIMARY KEY,
        session_id VARCHAR(100) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        student_id VARCHAR(100) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        teacher_id VARCHAR(100) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
        method TEXT NOT NULL CHECK (method IN ('manual', 'ai')),
        confidence NUMERIC(4,3),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_student_session_record UNIQUE (session_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS content (
        id VARCHAR(100) PRIMARY KEY,
        teacher_id VARCHAR(100) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('assignment', 'note', 'ppt')),
        difficulty TEXT,
        question_count INTEGER,
        question_types TEXT,
        detail_level TEXT,
        slide_count INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    console.log("✅ [Database] PostgreSQL schema initialized successfully.");
  } catch (err: any) {
    console.error("❌ [Database] Failed to initialize PostgreSQL tables:", err.message);
  } finally {
    client.release();
  }
}

// ==============================================================================
// Database Operations
// ==============================================================================
export const db = {
  // Profiles & Auth
  async getUserByEmail(email: string) {
    if (!pool) return null;
    const res = await pool.query("SELECT * FROM profiles WHERE LOWER(email) = LOWER($1)", [email]);
    return res.rows[0] || null;
  },

  async getFullProfile(userId: string) {
    if (!pool) return null;
    const pRes = await pool.query("SELECT * FROM profiles WHERE id = $1", [userId]);
    const profile = pRes.rows[0];
    if (!profile) return null;

    if (profile.role === "teacher") {
      const tRes = await pool.query("SELECT * FROM teachers WHERE id = $1", [userId]);
      const teacher = tRes.rows[0] || {};
      return {
        uid: profile.id,
        name: profile.name,
        email: profile.email,
        role: "teacher",
        department: teacher.department,
        subject: teacher.subject,
        avatarUrl: profile.avatar_url,
      };
    }

    if (profile.role === "student") {
      const sRes = await pool.query(`
        SELECT s.*, f.descriptor, f.image_url as face_image_url 
        FROM students s
        LEFT JOIN student_faces f ON f.student_id = s.id
        WHERE s.user_id = $1 OR s.id = $1 OR LOWER(s.name) = LOWER($2)
        LIMIT 1
      `, [userId, profile.name]);
      const student = sRes.rows[0] || {};

      return {
        uid: profile.id,
        name: profile.name,
        email: profile.email,
        role: "student",
        enrollmentNumber: student.enrollment_number,
        branch: student.branch,
        year: student.year,
        division: student.division,
        photoUrl: student.photo_url || student.face_image_url || profile.avatar_url,
        voiceSampleUrl: student.voice_sample_url,
        faceDescriptor: student.descriptor,
      };
    }

    return {
      uid: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    };
  },

  async createProfile(data: { id: string; name: string; email: string; password?: string; role: string }) {
    if (!pool) return null;
    const res = await pool.query(`
      INSERT INTO profiles (id, name, email, password, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING *
    `, [data.id, data.name, data.email, data.password || "", data.role]);
    return res.rows[0];
  },

  async saveTeacherProfile(userId: string, data: { department: string; subject: string; name?: string; email?: string }) {
    if (!pool) return null;
    if (data.name && data.email) {
      await pool.query(`
        INSERT INTO profiles (id, name, email, role)
        VALUES ($1, $2, $3, 'teacher')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
      `, [userId, data.name, data.email]);
    }

    await pool.query(`
      INSERT INTO teachers (id, department, subject)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET department = EXCLUDED.department, subject = EXCLUDED.subject
    `, [userId, data.department, data.subject]);

    return this.getFullProfile(userId);
  },

  async saveStudentProfile(userId: string, data: {
    name: string;
    email?: string;
    enrollmentNumber: string;
    branch: string;
    year: string;
    division: string;
    photoUrl?: string;
    voiceSampleUrl?: string;
    faceDescriptor?: number[];
  }) {
    if (!pool) return null;
    const studentId = userId;

    if (data.name && data.email) {
      await pool.query(`
        INSERT INTO profiles (id, name, email, role)
        VALUES ($1, $2, $3, 'student')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
      `, [userId, data.name, data.email]);
    }

    await pool.query(`
      INSERT INTO students (id, user_id, name, enrollment_number, branch, year, division, photo_url, voice_sample_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        enrollment_number = EXCLUDED.enrollment_number,
        branch = EXCLUDED.branch,
        year = EXCLUDED.year,
        division = EXCLUDED.division,
        photo_url = EXCLUDED.photo_url,
        updated_at = NOW()
    `, [studentId, userId, data.name, data.enrollmentNumber, data.branch, data.year, data.division, data.photoUrl || null, data.voiceSampleUrl || null]);

    if (data.faceDescriptor) {
      const faceId = `face-${studentId}`;
      await pool.query(`
        INSERT INTO student_faces (id, student_id, descriptor, image_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          descriptor = EXCLUDED.descriptor,
          image_url = EXCLUDED.image_url
      `, [faceId, studentId, JSON.stringify(data.faceDescriptor), data.photoUrl || null]);
    }

    return this.getFullProfile(userId);
  },

  // Student Directory
  async getStudents() {
    if (!pool) return [];
    const res = await pool.query(`
      SELECT s.*, f.descriptor, f.image_url as face_image_url
      FROM students s
      LEFT JOIN student_faces f ON f.student_id = s.id
      ORDER BY s.name ASC
    `);
    return res.rows.map(row => ({
      uid: row.id,
      name: row.name,
      email: `${row.enrollment_number.toLowerCase()}@student.teachease.edu`,
      role: "student" as const,
      enrollmentNumber: row.enrollment_number,
      branch: row.branch,
      year: row.year,
      division: row.division,
      photoUrl: row.photo_url || row.face_image_url,
      faceDescriptor: row.descriptor ? (Array.isArray(row.descriptor) ? row.descriptor : Object.values(row.descriptor)) : undefined,
      voiceSampleUrl: row.voice_sample_url
    }));
  },

  async deleteStudent(id: string) {
    if (!pool) return;
    await pool.query("DELETE FROM students WHERE id = $1", [id]);
  },

  // Attendance Sessions & Records
  async getAttendanceSessions(teacherId?: string) {
    if (!pool) return [];
    let query = `
      SELECT s.*, 
        COUNT(a.id) as total_students,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
      FROM attendance_sessions s
      LEFT JOIN attendance a ON a.session_id = s.id
    `;
    const params: any[] = [];
    if (teacherId) {
      query += " WHERE s.teacher_id = $1";
      params.push(teacherId);
    }
    query += " GROUP BY s.id ORDER BY s.date DESC, s.created_at DESC";

    const res = await pool.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      teacherId: row.teacher_id,
      subject: row.subject,
      date: row.date ? new Date(row.date).toISOString().split("T")[0] : "",
      year: row.year,
      branch: row.branch,
      division: row.division,
      sessionNumber: row.session_number,
      sessionType: row.session_type,
      startTime: row.start_time,
      createdAt: row.created_at,
      totalStudents: parseInt(row.total_students || "0", 10),
      presentCount: parseInt(row.present_count || "0", 10),
      absentCount: parseInt(row.absent_count || "0", 10),
    }));
  },

  async getAttendanceRecords(sessionId?: string, teacherId?: string) {
    if (!pool) return [];
    let query = `
      SELECT a.*, s.name as student_name, s.enrollment_number, s.branch, s.year, s.division,
             sess.session_number, sess.session_type, sess.start_time
      FROM attendance a
      LEFT JOIN students s ON s.id = a.student_id
      LEFT JOIN attendance_sessions sess ON sess.id = a.session_id
    `;
    const clauses: string[] = [];
    const params: any[] = [];

    if (sessionId) {
      params.push(sessionId);
      clauses.push(`a.session_id = $${params.length}`);
    }
    if (teacherId) {
      params.push(teacherId);
      clauses.push(`a.teacher_id = $${params.length}`);
    }

    if (clauses.length > 0) {
      query += " WHERE " + clauses.join(" AND ");
    }
    query += " ORDER BY a.date DESC, a.created_at DESC";

    const res = await pool.query(query, params);
    return res.rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      sessionNumber: r.session_number || "Session 1",
      sessionType: r.session_type || "Lecture",
      startTime: r.start_time,
      studentId: r.student_id,
      studentName: r.student_name || "Unknown",
      status: r.status,
      date: r.date ? new Date(r.date).toISOString().split("T")[0] : "",
      teacherId: r.teacher_id,
      subject: r.subject,
      method: r.method,
      confidence: r.confidence ? parseFloat(r.confidence) : undefined,
      branch: r.branch,
      year: r.year,
      division: r.division,
      createdAt: r.created_at,
    }));
  },

  async saveAttendanceSession(session: any, records: any[]) {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Upsert attendance_sessions
      await client.query(`
        INSERT INTO attendance_sessions (id, teacher_id, subject, date, year, branch, division, session_number, session_type, start_time, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          subject = EXCLUDED.subject,
          date = EXCLUDED.date,
          session_number = EXCLUDED.session_number,
          session_type = EXCLUDED.session_type,
          start_time = EXCLUDED.start_time,
          updated_at = NOW()
      `, [
        session.id,
        session.teacherId,
        session.subject,
        session.date,
        session.year,
        session.branch,
        session.division || "Div A",
        session.sessionNumber || "Session 1",
        session.sessionType || "Lecture",
        session.startTime || null,
        session.createdAt || new Date().toISOString()
      ]);

      // 2. Insert records
      for (const r of records) {
        await client.query(`
          INSERT INTO attendance (id, session_id, student_id, teacher_id, subject, date, status, method, confidence, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (session_id, student_id) DO UPDATE SET
            status = EXCLUDED.status,
            method = EXCLUDED.method,
            confidence = EXCLUDED.confidence
        `, [
          r.id,
          session.id,
          r.studentId,
          r.teacherId,
          r.subject,
          r.date,
          r.status,
          r.method || "manual",
          r.confidence || null,
          r.createdAt || new Date().toISOString()
        ]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteAttendanceSession(sessionId: string) {
    if (!pool) return;
    await pool.query("DELETE FROM attendance_sessions WHERE id = $1", [sessionId]);
  },

  // Academic Content
  async getContent(type?: string, teacherId?: string) {
    if (!pool) return [];
    let query = "SELECT * FROM content";
    const clauses: string[] = [];
    const params: any[] = [];

    if (type) {
      params.push(type);
      clauses.push(`type = $${params.length}`);
    }
    if (teacherId) {
      params.push(teacherId);
      clauses.push(`teacher_id = $${params.length}`);
    }

    if (clauses.length > 0) {
      query += " WHERE " + clauses.join(" AND ");
    }
    query += " ORDER BY created_at DESC";

    const res = await pool.query(query, params);
    return res.rows.map(r => ({
      id: r.id,
      teacherId: r.teacher_id,
      subject: r.subject,
      topic: r.topic,
      type: r.type,
      difficulty: r.difficulty,
      questionCount: r.question_count,
      questionTypes: r.question_types,
      detailLevel: r.detail_level,
      slideCount: r.slide_count,
      content: r.content,
      createdAt: r.created_at,
    }));
  },

  async saveContent(c: any) {
    if (!pool) return;
    await pool.query(`
      INSERT INTO content (id, teacher_id, subject, topic, type, difficulty, question_count, question_types, detail_level, slide_count, content, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        topic = EXCLUDED.topic
    `, [
      c.id,
      c.teacherId,
      c.subject,
      c.topic,
      c.type,
      c.difficulty || null,
      c.questionCount || null,
      c.questionTypes || null,
      c.detailLevel || null,
      c.slideCount || null,
      c.content,
      c.createdAt || new Date().toISOString()
    ]);
  },

  async deleteContent(id: string) {
    if (!pool) return;
    await pool.query("DELETE FROM content WHERE id = $1", [id]);
  }
};
