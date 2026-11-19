import { supabaseDb, supabaseAuth, isSupabaseConfigured } from "./supabaseService";
import { apiService } from "./apiService";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  password?: string;
  department?: string;
  subject?: string;
  enrollmentNumber?: string;
  year?: string;
  branch?: string;
  division?: string;
  photoUrl?: string;
  voiceSampleUrl?: string;
  faceDescriptor?: number[];
  avatarUrl?: string;
}

export interface AttendanceSession {
  id: string;
  teacherId: string;
  subject: string;
  date: string;
  year: string;
  branch: string;
  division?: string;
  sessionNumber: string; // e.g. "Session 1", "Session 2", "Session 3"
  sessionType: "Lecture" | "Practical" | "Tutorial";
  startTime?: string;    // e.g. "10:30 AM"
  createdAt: string;
  totalStudents?: number;
  presentCount?: number;
  absentCount?: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId?: string;
  sessionNumber?: string;
  sessionType?: string;
  startTime?: string;
  studentId: string;
  studentName: string;
  status: "present" | "absent";
  date: string;
  teacherId: string;
  subject: string;
  method: "manual" | "ai";
  branch?: string;
  year?: string;
  division?: string;
  confidence?: number;
  createdAt: string;
}

export interface AIContent {
  id: string;
  topic: string;
  subject: string;
  content: string;
  teacherId: string;
  type: "assignment" | "note" | "ppt";
  difficulty?: string;
  questionCount?: number;
  questionTypes?: string;
  detailLevel?: string;
  slideCount?: number;
  createdAt: string;
}

export const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

class StorageService {
  private static instance: StorageService;

  private constructor() {
    this.initDefaultData();
  }

  private initDefaultData() {
    // Seed initial demo users if storage is empty
    const existingUsers = localStorage.getItem("teachease_users");
    if (!existingUsers || JSON.parse(existingUsers).length === 0) {
      const demoUsers: UserProfile[] = [
        {
          uid: "c38a1649-1d37-4d1a-82bf-79f90f230101",
          name: "Dr. Elizabeth Smith",
          email: "teacher@example.com",
          password: "password123",
          role: "teacher",
          department: "Computer Science & Engineering",
          subject: "Data Structures & Algorithms"
        },
        {
          uid: "d49b275a-2e48-5e2b-93ca-80e01f340202",
          name: "Alex Johnson",
          email: "alex@example.com",
          password: "password123",
          role: "student",
          enrollmentNumber: "EN2024-CS-001",
          year: "Third Year",
          branch: "Computer Science",
          division: "Div A",
          photoUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80"
        },
        {
          uid: "e5ac386b-3f59-6f3c-a4db-91f12e450303",
          name: "Sophia Martinez",
          email: "sophia@example.com",
          password: "password123",
          role: "student",
          enrollmentNumber: "EN2024-CS-002",
          year: "Third Year",
          branch: "Computer Science",
          division: "Div A",
          photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80"
        },
        {
          uid: "f6bd497c-4a6a-704d-b5ec-a2e23f560404",
          name: "Rohan Sharma",
          email: "rohan@example.com",
          password: "password123",
          role: "student",
          enrollmentNumber: "EN2024-IT-003",
          year: "Second Year",
          branch: "Information Technology",
          division: "Div B",
          photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
        },
        {
          uid: "07ce5a8d-5b7b-815e-c6fd-b3f340670505",
          name: "Emily Watson",
          email: "emily@example.com",
          password: "password123",
          role: "student",
          enrollmentNumber: "EN2024-CS-004",
          year: "Third Year",
          branch: "Computer Science",
          division: "Div A",
          photoUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80"
        }
      ];
      localStorage.setItem("teachease_users", JSON.stringify(demoUsers));
    }

    // Seed initial sessions and attendance
    if (!localStorage.getItem("teachease_sessions")) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const initialSessions: AttendanceSession[] = [
        {
          id: "sess-demo-1",
          teacherId: "c38a1649-1d37-4d1a-82bf-79f90f230101",
          subject: "Data Structures",
          date: yesterday,
          year: "Third Year",
          branch: "Computer Science",
          division: "Div A",
          sessionNumber: "Session 1",
          sessionType: "Lecture",
          startTime: "10:30 AM",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          totalStudents: 4,
          presentCount: 3,
          absentCount: 1,
        }
      ];
      localStorage.setItem("teachease_sessions", JSON.stringify(initialSessions));
    }

    if (!localStorage.getItem("teachease_attendance")) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const initialAttendance: AttendanceRecord[] = [
        {
          id: "att-1",
          sessionId: "sess-demo-1",
          sessionNumber: "Session 1",
          sessionType: "Lecture",
          startTime: "10:30 AM",
          studentId: "d49b275a-2e48-5e2b-93ca-80e01f340202",
          studentName: "Alex Johnson",
          status: "present",
          date: yesterday,
          teacherId: "c38a1649-1d37-4d1a-82bf-79f90f230101",
          subject: "Data Structures",
          method: "ai",
          branch: "Computer Science",
          year: "Third Year",
          division: "Div A",
          confidence: 0.92,
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: "att-2",
          sessionId: "sess-demo-1",
          sessionNumber: "Session 1",
          sessionType: "Lecture",
          startTime: "10:30 AM",
          studentId: "e5ac386b-3f59-6f3c-a4db-91f12e450303",
          studentName: "Sophia Martinez",
          status: "present",
          date: yesterday,
          teacherId: "c38a1649-1d37-4d1a-82bf-79f90f230101",
          subject: "Data Structures",
          method: "ai",
          branch: "Computer Science",
          year: "Third Year",
          division: "Div A",
          confidence: 0.88,
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: "att-3",
          sessionId: "sess-demo-1",
          sessionNumber: "Session 1",
          sessionType: "Lecture",
          startTime: "10:30 AM",
          studentId: "f6bd497c-4a6a-704d-b5ec-a2e23f560404",
          studentName: "Rohan Sharma",
          status: "absent",
          date: yesterday,
          teacherId: "c38a1649-1d37-4d1a-82bf-79f90f230101",
          subject: "Data Structures",
          method: "manual",
          branch: "Information Technology",
          year: "Second Year",
          division: "Div B",
          createdAt: new Date(Date.now() - 86400000).toISOString()
        }
      ];
      localStorage.setItem("teachease_attendance", JSON.stringify(initialAttendance));
    }

    if (!localStorage.getItem("teachease_content")) {
      localStorage.setItem("teachease_content", JSON.stringify([]));
    }
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // ============================================================================
  // Auth & Profile Persistence Methods
  // ============================================================================
  public getUsers(): UserProfile[] {
    return JSON.parse(localStorage.getItem("teachease_users") || "[]");
  }

  public saveUser(user: UserProfile) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.uid === user.uid || (user.email && u.email?.toLowerCase() === user.email.toLowerCase()));
    if (index > -1) {
      users[index] = { ...users[index], ...user };
    } else {
      users.push(user);
    }
    localStorage.setItem("teachease_users", JSON.stringify(users));

    // Also update active session if it matches this user
    try {
      const active = localStorage.getItem("teachease_session");
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed.uid === user.uid || parsed.email?.toLowerCase() === user.email?.toLowerCase()) {
          localStorage.setItem("teachease_session", JSON.stringify({ ...parsed, ...user }));
        }
      }
    } catch (err) {
      console.warn("Could not sync teachease_session:", err);
    }

    if (isSupabaseConfigured()) {
      supabaseDb.upsertProfile({
        id: user.uid,
        name: user.name,
        email: user.email,
        role: user.role
      }).catch(err => console.warn("Supabase upsertProfile failed in saveUser:", err));
    }
  }

  public getUserByEmail(email: string): UserProfile | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  /**
   * Retrieves the active profile across refreshes and restarts.
   * Prioritizes active Supabase Auth session with database profile joins.
   */
  public async getActiveProfile(): Promise<UserProfile | null> {
    if (isSupabaseConfigured()) {
      try {
        const session = await supabaseAuth.getSession();
        if (session && session.user) {
          const fullProfile = await supabaseDb.getFullProfile(session.user.id);
          if (fullProfile) {
            localStorage.setItem("teachease_session", JSON.stringify(fullProfile));
            this.saveUser(fullProfile);
            return fullProfile;
          }
        }
      } catch (err) {
        console.warn("Could not fetch active profile from Supabase:", err);
      }
    }

    // Fall back to persistent localStorage
    try {
      const cached = localStorage.getItem("teachease_session");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn("Error reading cached session:", err);
    }
    return null;
  }

  /**
   * Centralized Login: Tries Supabase Auth first, retrieves full profile,
   * falls back to cached local users if offline.
   */
  public async login(email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Try Render PostgreSQL backend API first
    try {
      const res = await apiService.login({ email: cleanEmail, password });
      if (res && res.user) {
        localStorage.setItem("teachease_session", JSON.stringify(res.user));
        this.saveUser(res.user);
        return res.user;
      }
    } catch (apiErr: any) {
      // If server returned specific credential error, don't throw yet—check Supabase or local
      console.warn("Backend API login notice:", apiErr?.message);
    }

    if (isSupabaseConfigured()) {
      try {
        const authRes = await supabaseAuth.signIn(cleanEmail, password);
        if (authRes.user) {
          const profile = await supabaseDb.getFullProfile(authRes.user.id);
          if (profile) {
            localStorage.setItem("teachease_session", JSON.stringify(profile));
            this.saveUser(profile);
            return profile;
          }
          // If profile table doesn't have details yet, construct from user metadata
          const fallbackUser: UserProfile = {
            uid: authRes.user.id,
            name: authRes.user.user_metadata?.name || cleanEmail.split("@")[0],
            email: authRes.user.email || cleanEmail,
            role: (authRes.user.user_metadata?.role as "teacher" | "student") || "teacher",
          };
          localStorage.setItem("teachease_session", JSON.stringify(fallbackUser));
          this.saveUser(fallbackUser);
          return fallbackUser;
        }
      } catch (authErr: any) {
        console.warn("Supabase signIn failed, checking local users:", authErr.message);
        // If error is definitely invalid credentials and user doesn't exist locally, throw it
        const localUser = this.getUserByEmail(cleanEmail);
        if (!localUser || localUser.password !== password) {
          throw new Error(authErr.message || "Invalid email or password.");
        }
      }
    }

    // Local user check
    const local = this.getUserByEmail(cleanEmail);
    if (local && local.password === password) {
      localStorage.setItem("teachease_session", JSON.stringify(local));
      return local;
    }

    throw new Error("Invalid email or password.");
  }

  /**
   * Centralized Register: Signs up with Backend API / Supabase Auth, assigns genuine UUID,
   * stores profile permanently.
   */
  public async register(name: string, email: string, password: string, role: "teacher" | "student"): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    if (this.getUserByEmail(cleanEmail)) {
      throw new Error("An account with this email address already exists.");
    }

    let uid = generateUUID();

    // 1. Try Render PostgreSQL backend API
    try {
      const apiRes = await apiService.register({ id: uid, name, email: cleanEmail, password, role });
      if (apiRes && apiRes.user && apiRes.user.id) {
        uid = apiRes.user.id;
      }
    } catch (apiErr: any) {
      console.warn("Backend API register notice:", apiErr?.message);
    }

    // 2. Try Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const authRes = await supabaseAuth.signUp(cleanEmail, password, name, role);
        if (authRes.user) {
          uid = authRes.user.id;
        }
      } catch (authErr: any) {
        console.warn("Supabase signUp warning, creating local account with UUID:", authErr.message);
      }
    }

    const newUser: UserProfile = {
      uid,
      name: name.trim(),
      email: cleanEmail,
      password,
      role,
    };

    this.saveUser(newUser);
    localStorage.setItem("teachease_session", JSON.stringify(newUser));
    return newUser;
  }

  public async saveTeacherProfile(userId: string, data: { department: string; subject: string; name?: string; email?: string }): Promise<UserProfile> {
    const user = this.getUsers().find(u => u.uid === userId) || {
      uid: userId,
      name: data.name || "Teacher",
      email: data.email || "",
      role: "teacher" as const,
    };

    const updatedUser: UserProfile = {
      ...user,
      department: data.department,
      subject: data.subject,
      role: "teacher",
    };

    this.saveUser(updatedUser);
    localStorage.setItem("teachease_session", JSON.stringify(updatedUser));

    // Sync with Render PostgreSQL backend
    try {
      await apiService.saveTeacherProfile({
        userId,
        department: data.department,
        subject: data.subject,
        name: updatedUser.name,
        email: updatedUser.email
      });
    } catch (err: any) {
      console.warn("Backend API saveTeacherProfile notice:", err.message);
    }

    if (isSupabaseConfigured()) {
      try {
        await supabaseDb.saveTeacherProfile(userId, {
          department: data.department,
          subject: data.subject,
          name: updatedUser.name,
          email: updatedUser.email
        });
      } catch (err) {
        console.warn("Supabase saveTeacherProfile error:", err);
      }
    }

    return updatedUser;
  }

  public async saveStudentProfile(
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
  ): Promise<UserProfile> {
    const user = this.getUsers().find(u => u.uid === userId) || {
      uid: userId,
      name: data.name,
      email: data.email || `${data.enrollmentNumber.toLowerCase()}@student.teachease.edu`,
      role: "student" as const,
    };

    const updatedUser: UserProfile = {
      ...user,
      name: data.name,
      enrollmentNumber: data.enrollmentNumber,
      branch: data.branch,
      year: data.year,
      division: data.division,
      photoUrl: data.photoUrl,
      voiceSampleUrl: data.voiceSampleUrl,
      faceDescriptor: data.faceDescriptor,
      role: "student",
    };

    this.saveUser(updatedUser);
    localStorage.setItem("teachease_session", JSON.stringify(updatedUser));

    // Sync with Render PostgreSQL backend
    try {
      await apiService.saveStudentProfile({
        userId,
        name: updatedUser.name,
        email: updatedUser.email,
        enrollmentNumber: data.enrollmentNumber,
        branch: data.branch,
        year: data.year,
        division: data.division,
        photoUrl: data.photoUrl,
        voiceSampleUrl: data.voiceSampleUrl,
        faceDescriptor: data.faceDescriptor,
      });
    } catch (err: any) {
      console.warn("Backend API saveStudentProfile notice:", err.message);
    }

    if (isSupabaseConfigured()) {
      try {
        await supabaseDb.saveStudentProfile(userId, {
          name: updatedUser.name,
          email: updatedUser.email,
          enrollmentNumber: data.enrollmentNumber,
          branch: data.branch,
          year: data.year,
          division: data.division,
          photoUrl: data.photoUrl,
          voiceSampleUrl: data.voiceSampleUrl,
          faceDescriptor: data.faceDescriptor,
        });
      } catch (err) {
        console.warn("Supabase saveStudentProfile error:", err);
      }
    }

    return updatedUser;
  }

  // ============================================================================
  // Student Management & Synchronization
  // ============================================================================
  public getStudents(): UserProfile[] {
    return this.getUsers().filter(u => u.role === "student");
  }

  public async syncStudentsFromSupabase(): Promise<UserProfile[]> {
    // 1. Try Render PostgreSQL backend API first
    try {
      const apiRes = await apiService.getStudents();
      if (apiRes && Array.isArray(apiRes.students) && apiRes.students.length > 0) {
        const currentUsers = this.getUsers();
        let changed = false;

        apiRes.students.forEach((studentObj: any) => {
          const idx = currentUsers.findIndex(
            u => u.uid === studentObj.uid ||
              (studentObj.enrollmentNumber && u.enrollmentNumber?.toLowerCase() === studentObj.enrollmentNumber.toLowerCase())
          );
          if (idx > -1) {
            currentUsers[idx] = { ...currentUsers[idx], ...studentObj };
            changed = true;
          } else {
            currentUsers.push(studentObj);
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem("teachease_users", JSON.stringify(currentUsers));
        }
      }
    } catch (err: any) {
      console.warn("Backend API getStudents notice:", err.message);
    }

    if (!isSupabaseConfigured()) {
      return this.getStudents();
    }
    try {
      const dbStudents = await supabaseDb.getStudents();
      if (dbStudents && Array.isArray(dbStudents)) {
        const currentUsers = this.getUsers();
        let changed = false;

        dbStudents.forEach((row: any) => {
          const faceRecord = Array.isArray(row.student_faces) ? row.student_faces[0] : row.student_faces;
          const descriptor = faceRecord?.descriptor
            ? (Array.isArray(faceRecord.descriptor) ? faceRecord.descriptor : Array.from(faceRecord.descriptor))
            : undefined;

          const studentObj: UserProfile = {
            uid: row.id,
            name: row.name,
            email: `${(row.enrollment_number || row.id).toLowerCase()}@student.teachease.edu`,
            role: "student",
            enrollmentNumber: row.enrollment_number,
            branch: row.branch,
            year: row.year,
            division: row.division,
            photoUrl: row.photo_url || faceRecord?.image_url,
            faceDescriptor: descriptor,
            voiceSampleUrl: row.voice_sample_url
          };

          const idx = currentUsers.findIndex(
            u => u.uid === studentObj.uid ||
              (studentObj.enrollmentNumber && u.enrollmentNumber?.toLowerCase() === studentObj.enrollmentNumber.toLowerCase())
          );
          if (idx > -1) {
            currentUsers[idx] = { ...currentUsers[idx], ...studentObj };
            changed = true;
          } else {
            currentUsers.push(studentObj);
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem("teachease_users", JSON.stringify(currentUsers));
        }
      }
    } catch (err) {
      console.warn("syncStudentsFromSupabase failed:", err);
    }
    return this.getStudents();
  }

  public async saveStudent(student: UserProfile, photoFile?: File | Blob): Promise<UserProfile> {
    const studentUser: UserProfile = {
      ...student,
      role: "student",
      uid: student.uid || generateUUID()
    };

    let photoUrl = studentUser.photoUrl;

    if (isSupabaseConfigured()) {
      if (photoFile) {
        const uploadedUrl = await supabaseDb.uploadStudentPhoto(photoFile, studentUser.uid);
        if (uploadedUrl) {
          photoUrl = uploadedUrl;
          studentUser.photoUrl = uploadedUrl;
        }
      }

      await supabaseDb.saveStudent({
        id: studentUser.uid,
        name: studentUser.name,
        enrollment_number: studentUser.enrollmentNumber || "",
        branch: studentUser.branch || "",
        year: studentUser.year || "",
        division: studentUser.division || "",
        photo_url: photoUrl,
        voice_sample_url: studentUser.voiceSampleUrl
      }, studentUser.faceDescriptor, photoUrl);
    }

    this.saveUser(studentUser);
    return studentUser;
  }

  public deleteStudent(studentId: string) {
    const users = this.getUsers().filter(u => u.uid !== studentId);
    localStorage.setItem("teachease_users", JSON.stringify(users));
  }

  // ============================================================================
  // Session-Based Attendance (Multiple Sessions Per Day Support)
  // ============================================================================
  public getAttendanceSessions(teacherId?: string): AttendanceSession[] {
    const sessions: AttendanceSession[] = JSON.parse(localStorage.getItem("teachease_sessions") || "[]");
    const filtered = teacherId ? sessions.filter(s => s.teacherId === teacherId) : sessions;
    return filtered.sort((a, b) => {
      // Sort by date desc, then createdAt desc
      const dateCmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateCmp !== 0) return dateCmp;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public async syncAttendanceSessionsFromSupabase(teacherId?: string): Promise<AttendanceSession[]> {
    // 1. Try Render PostgreSQL backend API first
    try {
      const apiRes = await apiService.getAttendanceSessions(teacherId);
      if (apiRes && Array.isArray(apiRes.sessions) && apiRes.sessions.length > 0) {
        const localSessions = this.getAttendanceSessions();
        apiRes.sessions.forEach((sessObj: any) => {
          const idx = localSessions.findIndex(s => s.id === sessObj.id);
          if (idx > -1) {
            localSessions[idx] = { ...localSessions[idx], ...sessObj };
          } else {
            localSessions.push(sessObj);
          }
        });
        localStorage.setItem("teachease_sessions", JSON.stringify(localSessions));
      }

      const recRes = await apiService.getAttendanceRecords(undefined, teacherId);
      if (recRes && Array.isArray(recRes.records) && recRes.records.length > 0) {
        const allAtt = this.getAttendance();
        recRes.records.forEach((attRecord: any) => {
          const attIdx = allAtt.findIndex(a => a.id === attRecord.id || (a.sessionId === attRecord.sessionId && a.studentId === attRecord.studentId));
          if (attIdx > -1) {
            allAtt[attIdx] = { ...allAtt[attIdx], ...attRecord };
          } else {
            allAtt.push(attRecord);
          }
        });
        localStorage.setItem("teachease_attendance", JSON.stringify(allAtt));
      }
    } catch (err: any) {
      console.warn("Backend API getAttendanceSessions notice:", err.message);
    }

    if (!isSupabaseConfigured()) {
      return this.getAttendanceSessions(teacherId);
    }
    try {
      const dbSessions = await supabaseDb.getAttendanceSessions(teacherId);
      if (dbSessions && Array.isArray(dbSessions)) {
        const localSessions = this.getAttendanceSessions();
        dbSessions.forEach((dbSess: any) => {
          const sessObj: AttendanceSession = {
            id: dbSess.id,
            teacherId: dbSess.teacher_id,
            subject: dbSess.subject,
            date: dbSess.date,
            year: dbSess.year,
            branch: dbSess.branch,
            division: dbSess.division,
            sessionNumber: dbSess.session_number || "Session 1",
            sessionType: dbSess.session_type || "Lecture",
            startTime: dbSess.start_time || undefined,
            createdAt: dbSess.created_at || new Date().toISOString(),
            totalStudents: dbSess.attendance?.length || undefined,
            presentCount: dbSess.attendance ? dbSess.attendance.filter((a: any) => a.status === "present").length : undefined,
            absentCount: dbSess.attendance ? dbSess.attendance.filter((a: any) => a.status === "absent").length : undefined,
          };

          const idx = localSessions.findIndex(s => s.id === sessObj.id);
          if (idx > -1) {
            localSessions[idx] = { ...localSessions[idx], ...sessObj };
          } else {
            localSessions.push(sessObj);
          }

          // Also merge attendance records
          if (Array.isArray(dbSess.attendance) && dbSess.attendance.length > 0) {
            const allAtt = this.getAttendance();
            dbSess.attendance.forEach((r: any) => {
              const attRecord: AttendanceRecord = {
                id: r.id,
                sessionId: sessObj.id,
                sessionNumber: sessObj.sessionNumber,
                sessionType: sessObj.sessionType,
                startTime: sessObj.startTime,
                studentId: r.student_id,
                studentName: r.student_name || "Student",
                status: r.status,
                date: r.date,
                teacherId: r.teacher_id,
                subject: r.subject,
                method: r.method || "manual",
                confidence: r.confidence,
                createdAt: r.created_at || new Date().toISOString()
              };
              const attIdx = allAtt.findIndex(a => a.id === attRecord.id || (a.sessionId === attRecord.sessionId && a.studentId === attRecord.studentId));
              if (attIdx > -1) {
                allAtt[attIdx] = { ...allAtt[attIdx], ...attRecord };
              } else {
                allAtt.push(attRecord);
              }
            });
            localStorage.setItem("teachease_attendance", JSON.stringify(allAtt));
          }
        });
        localStorage.setItem("teachease_sessions", JSON.stringify(localSessions));
      }
    } catch (err) {
      console.warn("syncAttendanceSessionsFromSupabase warning:", err);
    }
    return this.getAttendanceSessions(teacherId);
  }

  public saveAttendanceSession(session: AttendanceSession, records: AttendanceRecord[]) {
    // 1. Calculate stats
    const presentCount = records.filter(r => r.status === "present").length;
    const absentCount = records.filter(r => r.status === "absent").length;
    const sessionWithStats: AttendanceSession = {
      ...session,
      totalStudents: records.length,
      presentCount,
      absentCount,
    };

    // 2. Save Session to localStorage
    const sessions = this.getAttendanceSessions();
    const sIndex = sessions.findIndex(s => s.id === session.id);
    if (sIndex > -1) {
      sessions[sIndex] = sessionWithStats;
    } else {
      sessions.unshift(sessionWithStats);
    }
    localStorage.setItem("teachease_sessions", JSON.stringify(sessions));

    // 3. Save Records to localStorage (replacing any existing records for this session)
    const allAttendance = this.getAttendance();
    const otherRecords = allAttendance.filter(r => r.sessionId !== session.id);
    const updatedRecords = [...otherRecords, ...records];
    localStorage.setItem("teachease_attendance", JSON.stringify(updatedRecords));

    // 4. Save to Render Backend
    try {
      apiService.saveAttendanceSession(sessionWithStats, records).catch(err => {
        console.warn("Backend API saveAttendanceSession notice:", err.message);
      });
    } catch {
      // ignore
    }

    // 5. Save to Supabase
    if (isSupabaseConfigured()) {
      supabaseDb.saveAttendanceSession(sessionWithStats, records).catch(err => {
        console.warn("Supabase saveAttendanceSession error:", err);
      });
    }
  }

  public deleteAttendanceSession(sessionId: string) {
    // Remove session
    const sessions = this.getAttendanceSessions().filter(s => s.id !== sessionId);
    localStorage.setItem("teachease_sessions", JSON.stringify(sessions));

    // Remove associated records
    const attendance = this.getAttendance().filter(r => r.sessionId !== sessionId);
    localStorage.setItem("teachease_attendance", JSON.stringify(attendance));

    // Delete from Render Backend
    try {
      apiService.deleteAttendanceSession(sessionId).catch(err => {
        console.warn("Backend API deleteAttendanceSession notice:", err.message);
      });
    } catch {
      // ignore
    }

    if (isSupabaseConfigured()) {
      supabaseDb.deleteAttendanceSession(sessionId).catch(err => {
        console.warn("Supabase deleteAttendanceSession error:", err);
      });
    }
  }

  // Attendance Records
  public getAttendance(): AttendanceRecord[] {
    return JSON.parse(localStorage.getItem("teachease_attendance") || "[]");
  }

  public saveAttendance(records: AttendanceRecord[]) {
    const all = this.getAttendance();
    const updated = [...all, ...records];
    localStorage.setItem("teachease_attendance", JSON.stringify(updated));

    if (isSupabaseConfigured()) {
      supabaseDb.saveAttendanceRecords(records.map(r => ({
        id: r.id,
        session_id: r.sessionId,
        student_id: r.studentId,
        teacher_id: r.teacherId,
        subject: r.subject,
        date: r.date,
        status: r.status,
        method: r.method,
        confidence: r.confidence
      })));
    }
  }

  public deleteAttendance(id: string) {
    const all = this.getAttendance().filter(r => r.id !== id);
    localStorage.setItem("teachease_attendance", JSON.stringify(all));
  }

  // ============================================================================
  // AI Content (FR-13, FR-16, FR-19)
  // ============================================================================
  public getContent(type?: "assignment" | "note" | "ppt", teacherId?: string): AIContent[] {
    let items: AIContent[] = JSON.parse(localStorage.getItem("teachease_content") || "[]");
    if (type) {
      items = items.filter(c => c.type === type);
    }
    if (teacherId) {
      items = items.filter(c => c.teacherId === teacherId);
    }
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public saveContent(content: AIContent) {
    const all = JSON.parse(localStorage.getItem("teachease_content") || "[]");
    all.unshift(content);
    localStorage.setItem("teachease_content", JSON.stringify(all));

    try {
      apiService.saveContent(content).catch(err => console.warn("Backend API saveContent notice:", err.message));
    } catch {
      // ignore
    }

    if (isSupabaseConfigured()) {
      supabaseDb.saveAIContent({
        id: content.id,
        teacher_id: content.teacherId,
        subject: content.subject,
        topic: content.topic,
        content: content.content,
        difficulty: content.difficulty,
        question_count: content.questionCount,
        question_types: content.questionTypes,
        detail_level: content.detailLevel,
        slide_count: content.slideCount,
        type: content.type
      });
    }
  }

  public deleteContent(id: string) {
    const all = JSON.parse(localStorage.getItem("teachease_content") || "[]").filter((c: AIContent) => c.id !== id);
    localStorage.setItem("teachease_content", JSON.stringify(all));

    try {
      apiService.deleteContent(id).catch(err => console.warn("Backend API deleteContent notice:", err.message));
    } catch {
      // ignore
    }
  }
}

export const storage = StorageService.getInstance();
