import { supabaseDb, isSupabaseConfigured } from "./supabaseService";

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
  geminiApiKey?: string;
  preferredModel?: string;
  autoFallbackEnabled?: boolean;
}

export interface AttendanceRecord {
  id: string;
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

class StorageService {
  private static instance: StorageService;

  private constructor() {
    // Initialize default data if empty or missing
    const existingUsers = localStorage.getItem("teachease_users");
    if (!existingUsers || JSON.parse(existingUsers).length === 0) {
      const demoUsers: UserProfile[] = [
        {
          uid: "teacher-123",
          name: "Dr. Elizabeth Smith",
          email: "teacher@example.com",
          password: "password123",
          role: "teacher",
          department: "Computer Science & Engineering",
          subject: "Data Structures & Algorithms"
        },
        {
          uid: "student-101",
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
          uid: "student-102",
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
          uid: "student-103",
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
          uid: "student-104",
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
    if (!localStorage.getItem("teachease_attendance")) {
      // Seed some initial attendance history
      const initialAttendance: AttendanceRecord[] = [
        {
          id: "att-1",
          studentId: "student-101",
          studentName: "Alex Johnson",
          status: "present",
          date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
          teacherId: "teacher-123",
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
          studentId: "student-102",
          studentName: "Sophia Martinez",
          status: "present",
          date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
          teacherId: "teacher-123",
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
          studentId: "student-103",
          studentName: "Rohan Sharma",
          status: "absent",
          date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
          teacherId: "teacher-123",
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

  // Auth & Profile Methods
  public getUsers(): UserProfile[] {
    return JSON.parse(localStorage.getItem("teachease_users") || "[]");
  }

  public saveUser(user: UserProfile) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.uid === user.uid);
    if (index > -1) {
      users[index] = { ...users[index], ...user };
    } else {
      users.push(user);
    }
    localStorage.setItem("teachease_users", JSON.stringify(users));

    if (isSupabaseConfigured()) {
      supabaseDb.upsertProfile({
        id: user.uid,
        name: user.name,
        email: user.email,
        role: user.role
      });
    }
  }

  public getUserByEmail(email: string): UserProfile | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  // BYOK: Teacher Gemini API Key Management (FR-20, FR-22, FR-23)
  public getTeacherApiKey(teacherId: string): string {
    const sessionKey = sessionStorage.getItem(`teachease_api_key_${teacherId}`);
    if (sessionKey) return sessionKey;
    const localKey = localStorage.getItem(`teachease_api_key_${teacherId}`);
    if (localKey) return localKey;
    const teacher = this.getUsers().find(u => u.uid === teacherId);
    return teacher?.geminiApiKey || "";
  }

  public setTeacherApiKey(teacherId: string, apiKey: string, remember: boolean = true) {
    sessionStorage.setItem(`teachease_api_key_${teacherId}`, apiKey);
    if (remember) {
      localStorage.setItem(`teachease_api_key_${teacherId}`, apiKey);
    } else {
      localStorage.removeItem(`teachease_api_key_${teacherId}`);
    }
    const user = this.getUsers().find(u => u.uid === teacherId);
    if (user) {
      user.geminiApiKey = apiKey;
      this.saveUser(user);
    }
  }

  public clearTeacherApiKey(teacherId: string) {
    sessionStorage.removeItem(`teachease_api_key_${teacherId}`);
    localStorage.removeItem(`teachease_api_key_${teacherId}`);
    const user = this.getUsers().find(u => u.uid === teacherId);
    if (user) {
      delete user.geminiApiKey;
      this.saveUser(user);
    }
  }

  // Teacher AI Model Preferences & Resiliency
  public getTeacherModel(teacherId: string): string {
    const sessionModel = sessionStorage.getItem(`teachease_model_${teacherId}`);
    if (sessionModel) return sessionModel;
    const localModel = localStorage.getItem(`teachease_model_${teacherId}`);
    if (localModel) return localModel;
    const teacher = this.getUsers().find(u => u.uid === teacherId);
    return teacher?.preferredModel || "gemini-2.5-flash";
  }

  public setTeacherModel(teacherId: string, model: string, remember: boolean = true) {
    sessionStorage.setItem(`teachease_model_${teacherId}`, model);
    if (remember) {
      localStorage.setItem(`teachease_model_${teacherId}`, model);
    }
    const user = this.getUsers().find(u => u.uid === teacherId);
    if (user) {
      user.preferredModel = model;
      this.saveUser(user);
    }
  }

  public getTeacherAutoFallback(teacherId: string): boolean {
    const val = localStorage.getItem(`teachease_fallback_${teacherId}`);
    if (val !== null) return val === "true";
    return true; // enabled by default for resilient 502 recovery
  }

  public setTeacherAutoFallback(teacherId: string, enabled: boolean) {
    localStorage.setItem(`teachease_fallback_${teacherId}`, String(enabled));
    const user = this.getUsers().find(u => u.uid === teacherId);
    if (user) {
      user.autoFallbackEnabled = enabled;
      this.saveUser(user);
    }
  }

  // Student Management (FR-03, FR-04)
  public getStudents(): UserProfile[] {
    return this.getUsers().filter(u => u.role === "student");
  }

  public saveStudent(student: UserProfile) {
    const studentUser: UserProfile = {
      ...student,
      role: "student",
      uid: student.uid || `student-${Math.random().toString(36).substr(2, 9)}`
    };
    this.saveUser(studentUser);

    if (isSupabaseConfigured()) {
      supabaseDb.saveStudent({
        id: studentUser.uid,
        name: studentUser.name,
        enrollment_number: studentUser.enrollmentNumber || "",
        branch: studentUser.branch || "",
        year: studentUser.year || "",
        division: studentUser.division || "",
        photo_url: studentUser.photoUrl,
        voice_sample_url: studentUser.voiceSampleUrl
      }, studentUser.faceDescriptor);
    }
  }

  public deleteStudent(studentId: string) {
    const users = this.getUsers().filter(u => u.uid !== studentId);
    localStorage.setItem("teachease_users", JSON.stringify(users));
  }

  // Attendance (FR-08, FR-10)
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

  // AI Content (FR-13, FR-16, FR-19)
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
  }
}

export const storage = StorageService.getInstance();
