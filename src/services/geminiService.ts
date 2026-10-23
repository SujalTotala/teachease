import { GoogleGenAI } from "@google/genai";
import { storage } from "./storageService";

export interface AIModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
}

export const AVAILABLE_MODELS: AIModelOption[] = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    badge: "Recommended",
    description: "Built-in reasoning, high-yield academic output, balanced speed."
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    badge: "Ultra-Fast & Stable",
    description: "Next-gen low latency with highest availability when gateways are busy."
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    badge: "Reliable Fallback",
    description: "Long-standing stable endpoint with high resilience to proxy issues."
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    badge: "Deep Reasoning",
    description: "Complex curricula, in-depth academic rubrics, and detailed derivations."
  }
];

/**
 * Resolves the Gemini API key following the Bring Your Own Key (BYOK) paradigm.
 * Order of precedence:
 * 1. Provided explicit key in arguments
 * 2. Teacher-specific stored key in current session / user profile
 * 3. Environment variable fallbacks (VITE_GEMINI_API_KEY, GEMINI_API_KEY)
 */
export const resolveGeminiApiKey = (teacherId?: string, explicitKey?: string): string => {
  if (explicitKey && explicitKey.trim()) {
    return explicitKey.trim().replace(/^['"]|['"]$/g, "");
  }
  if (teacherId) {
    const teacherKey = storage.getTeacherApiKey(teacherId);
    if (teacherKey && teacherKey.trim()) {
      return teacherKey.trim().replace(/^['"]|['"]$/g, "");
    }
  }

  // Check Vite env
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey && typeof envKey === "string" && envKey.trim()) {
    return envKey.trim().replace(/^['"]|['"]$/g, "");
  }

  // Check Vite defined GEMINI_API_KEY
  try {
    const processKey = (process?.env as any)?.GEMINI_API_KEY;
    if (processKey && typeof processKey === "string" && processKey.trim()) {
      return processKey.trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }

  const altMetaKey = (import.meta.env as any)?.GEMINI_API_KEY;
  if (altMetaKey && typeof altMetaKey === "string" && altMetaKey.trim()) {
    return altMetaKey.trim().replace(/^['"]|['"]$/g, "");
  }

  return "";
};

export const getAIClient = (teacherId?: string, explicitKey?: string): GoogleGenAI => {
  const apiKey = resolveGeminiApiKey(teacherId, explicitKey);
  if (!apiKey) {
    throw new Error("Gemini API Key is not set. Please configure your API key in AI Settings (BYOK).");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to determine if an error is a transient gateway / proxy / overload error
 * such as 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout, or network drop.
 */
export const isTransientOrGatewayError = (err: any): boolean => {
  if (!err) return false;
  const status = Number(err.status || err.code || err.statusCode || 0);
  if (status === 502 || status === 503 || status === 504 || status === 429) {
    return true;
  }
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes("502") ||
    msg.includes("bad gateway") ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("504") ||
    msg.includes("gateway timeout") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PromptExecutionOptions {
  teacherId?: string;
  explicitKey?: string;
  preferredModel?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Executes a prompt with multi-tier resilience:
 * 1. Exponential backoff retry on 502 Bad Gateway / transient gateway dropouts.
 * 2. Model cascade fallback (e.g. gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash).
 * 3. Server-side proxy fallback (/api/ai/generate) if browser network is intercepted.
 */
export const executeGeminiPrompt = async (
  prompt: string,
  options: PromptExecutionOptions = {}
): Promise<string> => {
  const { teacherId, explicitKey, temperature = 0.7, maxOutputTokens } = options;
  const apiKey = resolveGeminiApiKey(teacherId, explicitKey);
  if (!apiKey) {
    throw new Error("Gemini API Key is not set. Please configure your API key in AI Settings (BYOK).");
  }

  const teacherPreferredModel = options.preferredModel || (teacherId ? storage.getTeacherModel(teacherId) : "gemini-2.5-flash");
  const autoFallback = teacherId ? storage.getTeacherAutoFallback(teacherId) : true;

  // Build model cascade list
  const modelsToTry: string[] = [teacherPreferredModel];
  if (autoFallback) {
    const candidates = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    for (const c of candidates) {
      if (!modelsToTry.includes(c)) {
        modelsToTry.push(c);
      }
    }
  }

  let lastError: any = null;
  const client = new GoogleGenAI({ apiKey });

  // Tier 1 & 2: Direct browser client call with retry and fallback cascade
  for (const currentModel of modelsToTry) {
    const maxAttempts = 2; // 2 attempts per model for transient errors
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            temperature,
            ...(maxOutputTokens ? { maxOutputTokens } : {})
          }
        });

        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();

        // If the key itself is invalid or unauthorized (400, 401, 403), stop immediately
        if (
          msg.includes("api_key_invalid") ||
          msg.includes("400") ||
          msg.includes("401") ||
          msg.includes("403") ||
          msg.includes("unauthorized")
        ) {
          throw new Error("Invalid API key or unauthorized. Please verify your key from Google AI Studio.");
        }

        // If it's a 502 Bad Gateway / transient error, retry with delay
        if (isTransientOrGatewayError(err) && attempt < maxAttempts) {
          console.warn(`[TeachEase AI] 502/Gateway error on ${currentModel} (attempt ${attempt}/${maxAttempts}). Retrying in ${attempt * 1200}ms...`);
          await sleep(attempt * 1200);
          continue;
        }

        // Move to next model in fallback cascade
        if (modelsToTry.length > 1) {
          console.warn(`[TeachEase AI] Model ${currentModel} encountered error: ${err.message}. Cascading to next available fallback model...`);
        }
        break;
      }
    }
  }

  // Tier 3: Local Node.js server proxy fallback (/api/ai/generate)
  // This bypasses browser-level network proxy or firewall issues if dev server is running
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        prompt,
        model: teacherPreferredModel,
        config: { temperature, maxOutputTokens }
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.text) {
        return data.text;
      }
    }
  } catch {
    // Server proxy route not reachable or in static mode, fallback to original error
  }

  // Format a clear and actionable error message
  const rawMsg = lastError?.message || String(lastError || "Unknown generation error");
  if (isTransientOrGatewayError(lastError)) {
    throw new Error(
      `Google Gemini Gateway (502 Bad Gateway): Google's model servers are temporarily experiencing high traffic or upstream gateway timeout. ` +
      `We attempted automatic retries and model fallbacks. Please try again in a few moments, or select Gemini 2.0 Flash in AI Settings.`
    );
  }

  throw new Error(`Generation failed: ${rawMsg}`);
};

/**
 * FR-21: API Key Validation with Resilient Model Verification
 * Tests whether the entered API key is valid. If 502 occurs on primary model,
 * tests fallback models and returns actionable status.
 */
export const testGeminiApiKey = async (
  apiKey: string,
  preferredModel: string = "gemini-2.5-flash"
): Promise<{ valid: boolean; message: string; modelUsed?: string }> => {
  const cleanKey = apiKey ? apiKey.trim().replace(/^['"]|['"]$/g, "") : "";
  if (!cleanKey) {
    return { valid: false, message: "API key cannot be empty." };
  }

  const client = new GoogleGenAI({ apiKey: cleanKey });
  const modelsToTry = [preferredModel, "gemini-2.0-flash", "gemini-1.5-flash"].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: "Reply with 'OK' to verify API connectivity.",
        config: {
          maxOutputTokens: 10,
          temperature: 0.1
        }
      });

      if (response && response.text) {
        const isFallback = model !== preferredModel;
        return {
          valid: true,
          modelUsed: model,
          message: isFallback
            ? `API Key validated successfully! (Verified via fallback model: ${model} as ${preferredModel} had gateway traffic).`
            : `API Key validated successfully! Connected to Google Gemini (${model}).`
        };
      }
    } catch (error: any) {
      lastError = error;
      const errorMsg = (error?.message || String(error)).toLowerCase();

      // Clear authentication failures
      if (
        errorMsg.includes("api_key_invalid") ||
        errorMsg.includes("400") ||
        errorMsg.includes("401") ||
        errorMsg.includes("403") ||
        errorMsg.includes("unauthorized")
      ) {
        return {
          valid: false,
          message: "Invalid API key or unauthorized. Please check your key from Google AI Studio."
        };
      }

      // If transient 502, continue loop to try fallback model
      if (isTransientOrGatewayError(error)) {
        continue;
      }
    }
  }

  // Also test server proxy if browser direct fetch failed with network/502
  try {
    const proxyRes = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: cleanKey, model: preferredModel })
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.valid) return data;
    }
  } catch {
    // ignore
  }

  if (isTransientOrGatewayError(lastError)) {
    return {
      valid: false,
      message: "Google Gemini Gateway (502 Bad Gateway): Google's server gateway is currently overloaded or experiencing high traffic. Try selecting Gemini 2.0 Flash or Gemini 1.5 Flash below."
    };
  }

  return { valid: false, message: `Validation failed: ${lastError?.message || String(lastError)}` };
};

/**
 * FR-11 & FR-12: AI Assignment Generation
 */
export interface AssignmentOptions {
  subject: string;
  topic: string;
  difficulty: string;
  questionCount?: number;
  questionTypes?: string;
  teacherId?: string;
}

export const generateAssignment = async (options: AssignmentOptions): Promise<string> => {
  const { subject, topic, difficulty, questionCount = 5, questionTypes = "Mixed (MCQ, Short, Long)", teacherId } = options;

  const prompt = `You are an expert university professor and curriculum developer.
Generate an academic assignment for:
- Subject: ${subject}
- Topic: ${topic}
- Academic Difficulty Level: ${difficulty}
- Total Questions: ${questionCount}
- Question Types Required: ${questionTypes}

Requirements:
1. Provide a professional title and academic header with Total Marks and Estimated Time.
2. Structure the questions into clear sections according to the requested question types.
3. For each question, clearly indicate the suggested marks allocation in brackets.
4. Include a concise "Grading Rubric / Answer Hints" section at the end for the professor's reference.
5. Format beautifully in standard Markdown with clean tables, headings, and bold emphasis.`;

  return executeGeminiPrompt(prompt, {
    teacherId,
    temperature: 0.7
  });
};

/**
 * FR-14 & FR-15: AI Notes Generation
 */
export interface NotesOptions {
  subject: string;
  topic: string;
  detailLevel?: string;
  teacherId?: string;
}

export const generateNotes = async (options: NotesOptions): Promise<string> => {
  const { subject, topic, detailLevel = "Comprehensive Lecture Notes", teacherId } = options;

  const prompt = `You are a distinguished university professor lecturing on "${subject}".
Create structured, high-yield academic lecture notes on the topic: "${topic}".
Notes Format & Depth: ${detailLevel}

Structure the lecture notes with:
# [Topic Title] - Academic Lecture Notes
## 1. Learning Objectives & Overview
## 2. Fundamental Concepts & Key Terminology (include clear definitions)
## 3. Detailed Explanations & Theoretical Mechanisms
## 4. Real-World Applications & Industry Case Examples
## 5. Critical Takeaways & High-Yield Summary (quick bullet points)
## 6. Self-Assessment Questions & Further Reading

Ensure academic rigor, clarity, and format using clean Markdown with bolding, lists, and callout sections.`;

  return executeGeminiPrompt(prompt, {
    teacherId,
    temperature: 0.7
  });
};

/**
 * FR-17 & FR-18: AI PPT Content Generation
 */
export interface PPTOptions {
  subject: string;
  topic: string;
  slideCount?: number;
  detailLevel?: string;
  teacherId?: string;
}

export const generatePPTContent = async (options: PPTOptions): Promise<string> => {
  const { subject, topic, slideCount = 6, detailLevel = "Detailed Academic Lecture", teacherId } = options;

  const prompt = `You are an expert academic presentation designer.
Generate structured, slide-by-slide presentation content for a lecture on:
- Subject: ${subject || "General"}
- Topic: "${topic}"
- Number of Slides: ${slideCount}
- Presentation Depth: ${detailLevel}

For each of the ${slideCount} slides, strictly use this format:

### Slide [Number]: [Slide Title]
**Slide Purpose / Goal:** [Brief objective]
- **Main Point 1:** [Clear bullet point explanation]
- **Main Point 2:** [Clear bullet point explanation]
- **Supporting Detail / Example:** [Concrete example, statistic, or diagram idea]
*Speaker Notes for Professor:* [1-2 sentences of spoken guidance]

Ensure Slide 1 is the Title/Agenda slide and the final slide is the Summary/Q&A slide. Format in clean Markdown.`;

  return executeGeminiPrompt(prompt, {
    teacherId,
    temperature: 0.7
  });
};
