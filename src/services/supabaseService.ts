import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http"));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Database and storage helper operations with graceful degradation
export const supabaseDb = {
  // Storage - Student Photo Upload
  async uploadStudentPhoto(file: File | Blob, studentId: string): Promise<string> {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const bucketName = "student-photos";
    const fileExt = file instanceof File ? (file.name.split('.').pop() || 'jpg') : 'jpg';
    const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `${studentId}-${Date.now()}.${cleanExt}`;
    const filePath = `students/${fileName}`;

    // Upload to bucket
    let { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg"
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
            contentType: file.type || "image/jpeg"
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

  // Profiles
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

  // Students
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
        id: student.id,
        name: student.name,
        enrollment_number: student.enrollment_number,
        branch: student.branch,
        year: student.year,
        division: student.division,
        photo_url: photoUrl || student.photo_url || null,
        voice_sample_url: student.voice_sample_url || null,
      };

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .upsert(studentPayload)
        .select()
        .single();
      if (studentError) throw studentError;

      if (faceDescriptor && studentData) {
        // Check if student face already exists
        const { data: existingFaces } = await supabase
          .from("student_faces")
          .select("id")
          .eq("student_id", studentData.id)
          .limit(1);

        if (existingFaces && existingFaces.length > 0) {
          const { error: updateError } = await supabase
            .from("student_faces")
            .update({
              descriptor: faceDescriptor,
              image_url: photoUrl || studentPayload.photo_url || null,
            })
            .eq("id", existingFaces[0].id);
          if (updateError) console.warn("Supabase student_faces update failed:", updateError);
        } else {
          const { error: insertError } = await supabase
            .from("student_faces")
            .insert({
              student_id: studentData.id,
              descriptor: faceDescriptor,
              image_url: photoUrl || studentPayload.photo_url || null,
            });
          if (insertError) console.warn("Supabase student_faces insert failed:", insertError);
        }
      }
      return studentData;
    } catch (err) {
      console.warn("Supabase saveStudent failed:", err);
      throw err;
    }
  },

  // Attendance
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
  }
};
