import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON parsing
  app.use(express.json({ limit: "10mb" }));

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // AI Content Generation Proxy Fallback
  // Solves browser-level 502 Bad Gateway / firewall proxy / CORS issues
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { apiKey, prompt, model = "gemini-3-flash-preview", config } = req.body;
      const key = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || apiKey || "").trim().replace(/^['"]|['"]$/g, "");

      if (!key) {
        return res.status(400).json({ error: "Gemini API key is required. Please set VITE_GEMINI_API_KEY in your .env file." });
      }

      const requestedModel = (!model || model === "gemini-2.5-flash" || model === "gemini-2.0-flash") ? "gemini-3-flash-preview" : model;
      const modelsToTry = [requestedModel, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.5-flash"].filter(
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

          // If auth issue, stop immediately
          if (msg.includes("api_key_invalid") || msg.includes("400") || msg.includes("401") || msg.includes("403")) {
            return res.status(400).json({ error: "Invalid API key or unauthorized." });
          }

          // Otherwise (e.g. 404 retired model, 502/503/504 gateway timeout, or rate-limits), continue to fallback model
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
      const { apiKey, model = "gemini-3.8-flash" } = req.body;
      const key = (apiKey || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");

      if (!key) {
        return res.status(400).json({ valid: false, message: "API key is required." });
      }

      const requestedModel = (model === "gemini-2.5-flash" || !model) ? "gemini-3.8-flash" : model;
      const modelsToTry = [requestedModel, "gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash"].filter(
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
          // Continue to fallback model on 404 or transient error
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(` TeachEase Server running on http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
