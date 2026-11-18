import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http"));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// ==============================================================================
// Supabase Authentication Operations
// ==============================================================================
export const supabaseAuth = {
  async signUp(email: string, password: string, name: string, role: "teacher" | "student") {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },
      },
    });

    if (error) throw error;

    // Immediately record profile in public.profiles table using the authenticated user id
    if (data.user) {
      try {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          name,
          email,
          role,
          updated_at: new Date().toISOString(),
        });
      } catch (profileErr) {
        console.warn("Initial profile upsert warning:", profileErr);
      }
    }

    return data;
  },

  async signIn(email: string, password: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut error:", err);
    }
  },

  async getSession() {
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch {
      return null;
    }
  },

  async getUser() {
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getUser();
      return data.user;
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
    return supabase.auth.onAuthStateChange(callback);
  },
};

// ==============================================================================
// Database and Storage Helper Operations
// ==============================================================================
export const supabaseDb = {
  // Storage - Student Photo Upload
  async uploadStudentPhoto(file: File | Blob, studentId: string): Promise<string> {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const bucketName = "student-photos";
    const fileExt = file instanceof File ? file.name.split('.').pop() || 'jpg' : 'jpg';
    const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `${studentId}-${Date.now()}.${cleanExt}`;
    const filePath = `students/${fileName}`;

    let { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

    // If bucket doesn't exist yet, attempt to create it
    if (error && (error.message?.includes("Bucket not found") || (error as any).statusCode === 404 || (error as any).status === 404)) {
      try {
        await supabase.storage.createBucket(bucketName, { public: true });
        const retryResult = await supabase.storage
          .from(bucketName)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
        data = retryResult.data;
        error = retryResult.error;
      } catch (createErr) {
        console.warn("Could not auto-create storage bucket:", createErr);
      }
    }

    if (error) {
      console.error("Supabase storage upload error:", error);
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      throw new Error("Failed to retrieve public URL from Supabase Storage.");
    }

    return publicUrlData.publicUrl;
  },

  // Full Profile Retrieval (Profiles + Teachers or Students)
  async getFullProfile(userId: string) {
    if (!supabase) return null;
    try {
      // 1. Fetch base profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (pErr) throw pErr;
      if (!profile) return null;

      // 2. If teacher, fetch from teachers table
      if (profile.role === "teacher") {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        return {
          uid: profile.id,
          name: profile.name,
          email: profile.email,
          role: "teacher" as const,
          department: teacher?.department,
          subject: teacher?.subject,
          avatarUrl: profile.avatar_url,
        };
      }

      // 3. If student, fetch from students table
      if (profile.role === "student") {
        const { data: student } = await supabase
          .from("students")
          .select("*, student_faces(*)")
          .or(`user_id.eq.${userId},name.eq.${profile.name}`)
          .maybeSingle();

        const faces = student?.student_faces;
        const faceObj = Array.isArray(faces) ? faces[0] : faces;
        const descriptor = faceObj?.descriptor
          ? Array.isArray(faceObj.descriptor)
            ? faceObj.descriptor
            : Array.from(faceObj.descriptor)
          : undefined;

        return {
          uid: profile.id,
          name: profile.name,
          email: profile.email,
          role: "student" as const,
          enrollmentNumber: student?.enrollment_number,
          branch: student?.branch,
          year: student?.year,
          division: student?.division,
          photoUrl: student?.photo_url || faceObj?.image_url || profile.avatar_url,
          voiceSampleUrl: student?.voice_sample_url,
          faceDescriptor: descriptor,
        };
      }

      return {
        uid: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
      };
    } catch (err) {
      console.warn("Supabase getFullProfile error:", err);
      return null;
    }
  },

  // Save Teacher Profile
  async saveTeacherProfile(userId: string, data: { department: string; subject: string; name?: string; email?: string }) {
    if (!supabase) return null;
    try {
      if (data.name && data.email) {
        await supabase.from("profiles").upsert({
          id: userId,
          name: data.name,
          email: data.email,
          role: "teacher",
          updated_at: new Date().toISOString(),
        });
      }

      const { data: teacherRecord, error } = await supabase
        .from("teachers")
        .upsert({
          id: userId,
          department: data.department,
          subject: data.subject,
        })
        .select()
        .single();

      if (error) throw error;
      return teacherRecord;
    } catch (err) {
      console.warn("Supabase saveTeacherProfile failed:", err);
      throw err;
    }
  },

  // Save Student Profile
  async saveStudentProfile(
    userId: string,
    data: {
      name: string;
      email?: string;
      enrollmentNumber: string;
      branch: string;
      year: string;
      division: string;
      photoUrl?: string;
      voiceSampleUrl?: string;
      faceDescriptor?: number[];
    }
  ) {
    if (!supabase) return null;
    try {
      if (data.name && data.email) {
        await supabase.from("profiles").upsert({
          id: userId,
          name: data.name,
          email: data.email,
          role: "student",
          updated_at: new Date().toISOString(),
        });
      }

      const studentPayload = {
        user_id: userId,
        name: data.name,
        enrollment_number: data.enrollmentNumber,
        branch: data.branch,
        year: data.year,
        division: data.division,
        photo_url: data.photoUrl || null,
        voice_sample_url: data.voiceSampleUrl || null,
      };

      // Check if student record exists with same user_id or enrollment_number
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .or(`user_id.eq.${userId},enrollment_number.eq.${data.enrollmentNumber}`)
        .maybeSingle();

      let studentId = existing?.id;

      if (studentId) {
        const { error: updErr } = await supabase
          .from("students")
          .update(studentPayload)
          .eq("id", studentId);
        if (updErr) throw updErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("students")
          .insert(studentPayload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        studentId = inserted.id;
      }

      // Upsert face descriptor if present
      if (data.faceDescriptor && studentId) {
        const { data: existingFaces } = await supabase
          .from("student_faces")
          .select("id")
          .eq("student_id", studentId)
          .limit(1);

        if (existingFaces && existingFaces.length > 0) {
          await supabase
            .from("student_faces")
            .update({
              descriptor: data.faceDescriptor,
              image_url: data.photoUrl || null,
            })
            .eq("id", existingFaces[0].id);
        } else {
          await supabase.from("student_faces").insert({
            student_id: studentId,
            descriptor: data.faceDescriptor,
            image_url: data.photoUrl || null,
          });
        }
      }

      return { studentId, ...studentPayload };
    } catch (err) {
      console.warn("Supabase saveStudentProfile failed:", err);
      throw err;
    }
  },

  // Base Profiles list
  async getProfiles() {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("Supabase profiles query failed:", err);
      return null;
    }
  },

  async upsertProfile(profile: any) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from("profiles").upsert(profile).select();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("Supabase upsertProfile failed:", err);
      return null;
    }
  },

  // Students list
  async getStudents() {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from("students").select("*, student_faces(*)");
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("Supabase getStudents failed:", err);
      return null;
    }
  },

  async saveStudent(student: any, faceDescriptor?: number[], photoUrl?: string) {
    if (!supabase) return null;
    try {
      const studentPayload = {
        name: student.name,
        enrollment_number: student.enrollment_number,
        branch: student.branch,
        year: student.year,
        division: student.division,
        photo_url: photoUrl || student.photo_url || null,
        voice_sample_url: student.voice_sample_url || null,
      };

      // Check if student exists
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("enrollment_number", student.enrollment_number)
        .maybeSingle();

      let studentData: any = null;
      if (existing) {
        const { data: upd, error: updErr } = await supabase
          .from("students")
          .update(studentPayload)
          .eq("id", existing.id)
          .select()
          .single();
        if (updErr) throw updErr;
        studentData = upd;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("students")
          .insert(studentPayload)
          .select()
          .single();
        if (insErr) throw insErr;
        studentData = ins;
      }

      if (faceDescriptor && studentData) {
        const { data: existingFaces } = await supabase
          .from("student_faces")
          .select("id")
          .eq("student_id", studentData.id)
          .limit(1);

        if (existingFaces && existingFaces.length > 0) {
          await supabase
            .from("student_faces")
            .update({
              descriptor: faceDescriptor,
              image_url: photoUrl || studentPayload.photo_url || null,
            })
            .eq("id", existingFaces[0].id);
        } else {
          await supabase.from("student_faces").insert({
            student_id: studentData.id,
            descriptor: faceDescriptor,
            image_url: photoUrl || studentPayload.photo_url || null,
          });
        }
      }
      return studentData;
    } catch (err) {
      console.warn("Supabase saveStudent failed:", err);
      throw err;
    }
  },

  // ============================================================================
  // Session-Based Attendance (Multiple Sessions Per Day Support)
  // ============================================================================
  async getAttendanceSessions(teacherId?: string) {
    if (!supabase) return null;
    try {
      let query = supabase
        .from("attendance_sessions")
        .select("*, attendance(*)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (teacherId) {
        query = query.eq("teacher_id", teacherId);
      }

      const { data, error } = await query;
      if (error) {
        // Table might not exist yet if migration pending
        console.warn("Supabase attendance_sessions fetch warning:", error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("Supabase getAttendanceSessions error:", err);
      return null;
    }
  },

  async getAttendanceRecords(sessionId?: string, teacherId?: string) {
    if (!supabase) return null;
    try {
      let query = supabase.from("attendance").select("*").order("date", { ascending: false });
      if (sessionId) {
        query = query.eq("session_id", sessionId);
      }
      if (teacherId) {
        query = query.eq("teacher_id", teacherId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("Supabase getAttendanceRecords failed:", err);
      return null;
    }
  },

  async saveAttendanceSession(session: any, records: any[]) {
    if (!supabase) return null;
    try {
      // 1. Upsert attendance session record
      const sessionPayload = {
        id: session.id,
        teacher_id: session.teacherId,
        subject: session.subject,
        date: session.date,
        year: session.year,
        branch: session.branch,
        division: session.division || "Div A",
        session_number: session.sessionNumber || "Session 1",
        session_type: session.sessionType || "Lecture",
        start_time: session.startTime || null,
        created_at: session.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: sessionErr } = await supabase
        .from("attendance_sessions")
        .upsert(sessionPayload);

      if (sessionErr) {
        console.warn("attendance_sessions upsert note:", sessionErr.message);
      }

      // 2. Prepare attendance records with session_id
      const recordsPayload = records.map((r: any) => ({
        id: r.id,
        session_id: session.id,
        student_id: r.studentId,
        teacher_id: r.teacherId,
        subject: r.subject,
        date: r.date,
        status: r.status,
        method: r.method,
        confidence: r.confidence || null,
        created_at: r.createdAt || new Date().toISOString(),
      }));

      // Delete existing records for this session first to prevent duplicate entries
      try {
        await supabase.from("attendance").delete().eq("session_id", session.id);
      } catch {
        // ignore
      }

      const { data, error: attErr } = await supabase.from("attendance").insert(recordsPayload);
      if (attErr) throw attErr;

      return { session: sessionPayload, records: data };
    } catch (err) {
      console.warn("Supabase saveAttendanceSession failed:", err);
      throw err;
    }
  },

  async deleteAttendanceSession(sessionId: string) {
    if (!supabase) return null;
    try {
      await supabase.from("attendance").delete().eq("session_id", sessionId);
      const { error } = await supabase.from("attendance_sessions").delete().eq("id", sessionId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn("Supabase deleteAttendanceSession error:", err);
      return false;
    }
  },

  async saveAttendanceRecords(records: any[]) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from("attendance").insert(records);
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("Supabase saveAttendanceRecords failed:", err);
      return null;
    }
  },

  // Content (Assignments, Notes, Presentations)
  async saveAIContent(content: any) {
    if (!supabase) return null;
    try {
      const table = content.type === "assignment" ? "assignments" : content.type === "note" ? "notes" : "presentations";
      const { data, error } = await supabase.from(table).insert([content]);
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn(`Supabase saveAIContent failed for table ${content.type}:`, err);
      return null;
    }
  },
};
