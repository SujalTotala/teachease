/**
 * TeachEase Backend API Client
 * Connects the frontend to the Render PostgreSQL backend service.
 */

const getApiBaseUrl = (): string => {
  try {
    const customUrl = import.meta.env.VITE_API_URL || (import.meta.env as any).VITE_BACKEND_URL;
    if (customUrl && typeof customUrl === "string" && customUrl.trim()) {
      return customUrl.trim().replace(/\/+$/, "");
    }
  } catch {
    // fallback
  }
  return "";
};

export const API_BASE_URL = getApiBaseUrl();

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `API request failed with status ${response.status}`);
  }

  return response.json();
}

export const apiService = {
  // Health
  async checkHealth(): Promise<{ status: string; database?: string }> {
    return request<{ status: string; database?: string }>("/api/health");
  },

  // Auth & Profiles
  async register(data: { id?: string; name: string; email: string; password?: string; role: string }) {
    return request<{ user: any }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async login(credentials: { email: string; password?: string }) {
    return request<{ user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  async getProfile(userId: string) {
    return request<{ user: any }>(`/api/auth/profile/${encodeURIComponent(userId)}`);
  },

  async saveTeacherProfile(data: { userId: string; department: string; subject: string; name?: string; email?: string }) {
    return request<{ user: any }>("/api/auth/profile/teacher", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async saveStudentProfile(data: {
    userId: string;
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
    return request<{ user: any }>("/api/auth/profile/student", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // Students Directory
  async getStudents() {
    return request<{ students: any[] }>("/api/students");
  },

  async saveStudent(student: any) {
    return request<{ student: any }>("/api/students", {
      method: "POST",
      body: JSON.stringify(student),
    });
  },

  async deleteStudent(studentId: string) {
    return request<{ success: boolean }>(`/api/students/${encodeURIComponent(studentId)}`, {
      method: "DELETE",
    });
  },

  // Attendance Sessions & Records
  async getAttendanceSessions(teacherId?: string) {
    const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
    return request<{ sessions: any[] }>(`/api/attendance/sessions${query}`);
  },

  async saveAttendanceSession(session: any, records: any[]) {
    return request<{ success: boolean; sessionId: string }>("/api/attendance/sessions", {
      method: "POST",
      body: JSON.stringify({ session, records }),
    });
  },

  async deleteAttendanceSession(sessionId: string) {
    return request<{ success: boolean }>(`/api/attendance/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  },

  async getAttendanceRecords(sessionId?: string, teacherId?: string) {
    const params = new URLSearchParams();
    if (sessionId) params.append("sessionId", sessionId);
    if (teacherId) params.append("teacherId", teacherId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<{ records: any[] }>(`/api/attendance/records${query}`);
  },

  // Academic Content
  async getContent(type?: string, teacherId?: string) {
    const params = new URLSearchParams();
    if (type) params.append("type", type);
    if (teacherId) params.append("teacherId", teacherId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<{ content: any[] }>(`/api/content${query}`);
  },

  async saveContent(content: any) {
    return request<{ success: boolean; item: any }>("/api/content", {
      method: "POST",
      body: JSON.stringify(content),
    });
  },

  async deleteContent(id: string) {
    return request<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  // AI Content
  async generateAI(prompt: string, model = "gemini-3-flash-preview", config?: any) {
    return request<{ text: string; modelUsed?: string }>("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, model, config }),
    });
  },

  async testAIKey(apiKey?: string, model = "gemini-3-flash-preview") {
    return request<{ valid: boolean; message: string; modelUsed?: string }>("/api/ai/test", {
      method: "POST",
      body: JSON.stringify({ apiKey, model }),
    });
  }
};
