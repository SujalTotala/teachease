import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const key = (
    process.env.VITE_GEMINI_API_KEY || 
    process.env.GEMINI_API_KEY || 
    req.body?.apiKey || 
    ""
  ).trim().replace(/^['"]|['"]$/g, "");

  if (!key) {
    return res.status(500).json({ 
      error: "Gemini API key is not configured on Vercel environment variables. Please check VITE_GEMINI_API_KEY." 
    });
  }

  try {
    const { prompt, model = "gemini-3-flash-preview", config } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const requestedModel = (!model || model === "gemini-2.5-flash" || model === "gemini-1.5-flash") ? "gemini-3-flash-preview" : model;
    const modelsToTry = [requestedModel, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-2.0-flash"].filter(
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
          return res.status(200).json({ text: response.text, modelUsed: m });
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    return res.status(500).json({ error: lastError?.message || "AI generation failed across all models." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
