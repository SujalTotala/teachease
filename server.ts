import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { initDatabase, db, isDbConfigured } from "./server/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Initialize PostgreSQL database if configured
  await initDatabase();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // API health check (used by Render)
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "TeachEase Backend",
      database: isDbConfigured() ? "connected" : "fallback_mode",
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================================
  // Authentication & Profile Endpoints
  // ============================================================================
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: "Name and email are required." });
      }

      const existing = await db.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "An account with this email already exists." });
      }

      const id = req.body.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const profile = await db.createProfile({
        id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password || "",
        role: role || "teacher"
      });

      return res.status(201).json({ user: profile });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ error: err.message || "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required." });
      }

      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (password && user.password && user.password !== password) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const fullProfile = await db.getFullProfile(user.id);
      return res.json({ user: fullProfile || user });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message || "Login failed." });
    }
  });

  app.get("/api/auth/profile/:id", async (req, res) => {
    try {
      const profile = await db.getFullProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "User not found." });
      }
      return res.json({ user: profile });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/auth/profile/teacher", async (req, res) => {
    try {
      const { userId, department, subject, name, email } = req.body;
      if (!userId || !department || !subject) {
        return res.status(400).json({ error: "userId, department, and subject are required." });
      }

      const updated = await db.saveTeacherProfile(userId, { department, subject, name, email });
      return res.json({ user: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/auth/profile/student", async (req, res) => {
    try {
      const { userId, name, email, enrollmentNumber, branch, year, division, photoUrl, voiceSampleUrl, faceDescriptor } = req.body;
      if (!userId || !enrollmentNumber) {
        return res.status(400).json({ error: "userId and enrollmentNumber are required." });
      }

      const updated = await db.saveStudentProfile(userId, {
        name,
        email,
        enrollmentNumber,
        branch,
        year,
        division,
        photoUrl,
        voiceSampleUrl,
        faceDescriptor
      });
      return res.json({ user: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // Student Directory Endpoints
  // ============================================================================
  app.get("/api/students", async (req, res) => {
    try {
      const students = await db.getStudents();
      return res.json({ students });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/students", async (req, res) => {
    try {
      const { uid, id, name, enrollmentNumber, branch, year, division, photoUrl, voiceSampleUrl, faceDescriptor, email } = req.body;
      const studentId = id || uid || `student-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const updated = await db.saveStudentProfile(studentId, {
        name,
        email,
        enrollmentNumber,
        branch,
        year,
        division,
        photoUrl,
        voiceSampleUrl,
        faceDescriptor
      });

      return res.json({ student: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/students/:id", async (req, res) => {
    try {
      await db.deleteStudent(req.params.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // Session-Based Attendance Endpoints (Multiple Sessions Supported)
  // ============================================================================
  app.get("/api/attendance/sessions", async (req, res) => {
    try {
      const teacherId = req.query.teacherId as string | undefined;
      const sessions = await db.getAttendanceSessions(teacherId);
      return res.json({ sessions });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/attendance/sessions", async (req, res) => {
    try {
      const { session, records } = req.body;
      if (!session || !records) {
        return res.status(400).json({ error: "session and records arrays are required." });
      }

      await db.saveAttendanceSession(session, records);
      return res.status(201).json({ success: true, sessionId: session.id });
    } catch (err: any) {
      console.error("Save session error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/attendance/sessions/:id", async (req, res) => {
    try {
      await db.deleteAttendanceSession(req.params.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/attendance/records", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const teacherId = req.query.teacherId as string | undefined;
      const records = await db.getAttendanceRecords(sessionId, teacherId);
      return res.json({ records });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // Academic Content Endpoints (Assignments, Notes, PPTs)
  // ============================================================================
  app.get("/api/content", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const teacherId = req.query.teacherId as string | undefined;
      const items = await db.getContent(type, teacherId);
      return res.json({ content: items });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content", async (req, res) => {
    try {
      const content = req.body;
      if (!content || !content.id || !content.topic) {
        return res.status(400).json({ error: "Invalid content payload." });
      }
      await db.saveContent(content);
      return res.status(201).json({ success: true, item: content });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/content/:id", async (req, res) => {
    try {
      await db.deleteContent(req.params.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // AI Content Generation Proxy
  // ============================================================================
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { apiKey, prompt, model = "gemini-3-flash-preview", config } = req.body;
      const key = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || apiKey || "").trim().replace(/^['"]|['"]$/g, "");

      if (!key) {
        return res.status(400).json({ error: "Gemini API key is required. Please set VITE_GEMINI_API_KEY in your .env file." });
      }

      const requestedModel = (!model || model.includes("2.5") || model.includes("2.0") || model.includes("1.5")) ? "gemini-3-flash-preview" : model;
      const modelsToTry = [requestedModel, "gemini-3-flash-preview", "gemini-3.8-flash"].filter(
        (m, idx, arr) => arr.indexOf(m) === idx
      );

      let lastError: any = null;

      for (const m of modelsToTry) {
        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const response = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              temperature: config?.temperature ?? 0.7,
              ...(config?.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {})
            }
          });

          if (response && response.text) {
            return res.json({ text: response.text, modelUsed: m });
          }
        } catch (err: any) {
          lastError = err;
          const msg = (err?.message || String(err)).toLowerCase();

          if (msg.includes("api_key_invalid") || msg.includes("400") || msg.includes("401") || msg.includes("403")) {
            return res.status(400).json({ error: "Invalid API key or unauthorized." });
          }
          continue;
        }
      }

      return res.status(502).json({
        error: lastError?.message || "Google Gemini gateway returned Bad Gateway (502). Please retry shortly."
      });
    } catch (err: any) {
      console.error("AI server proxy error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // AI Key Test Proxy
  app.post("/api/ai/test", async (req, res) => {
    try {
      const { apiKey, model = "gemini-3-flash-preview" } = req.body;
      const key = (apiKey || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");

      if (!key) {
        return res.status(400).json({ valid: false, message: "API key is required." });
      }

      const requestedModel = (!model || model.includes("2.5") || model.includes("2.0") || model.includes("1.5")) ? "gemini-3-flash-preview" : model;
      const modelsToTry = [requestedModel, "gemini-3-flash-preview", "gemini-3.8-flash"].filter(
        (m, idx, arr) => arr.indexOf(m) === idx
      );

      let lastError: any = null;

      for (const m of modelsToTry) {
        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const response = await ai.models.generateContent({
            model: m,
            contents: "Reply with 'OK' to verify API connectivity.",
            config: { maxOutputTokens: 10, temperature: 0.1 }
          });

          if (response && response.text) {
            return res.json({
              valid: true,
              message: `API Key validated successfully! (Verified via ${m})`,
              modelUsed: m
            });
          }
        } catch (err: any) {
          lastError = err;
          const msg = (err?.message || String(err)).toLowerCase();
          if (msg.includes("api_key_invalid") || msg.includes("400") || msg.includes("401") || msg.includes("403")) {
            return res.status(200).json({ valid: false, message: "Invalid API key or unauthorized." });
          }
          continue;
        }
      }

      return res.status(200).json({
        valid: false,
        message: lastError?.message || "Verification failed with gateway error."
      });
    } catch (err: any) {
      return res.status(200).json({ valid: false, message: err.message || "Test failed" });
    }
  });

  // Vite middleware for development or Static Serving for Production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: process.cwd(),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 TeachEase Server running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🐘 PostgreSQL Status: ${isDbConfigured() ? 'Connected via DATABASE_URL' : 'Fallback Local Engine'}`);
  });
}

startServer();
