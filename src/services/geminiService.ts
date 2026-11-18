import { GoogleGenAI } from "@google/genai";

/**
 * Resolves the centralized Gemini API key from environment variables.
 * Precedence:
 * 1. Vite frontend env variable: import.meta.env.VITE_GEMINI_API_KEY or import.meta.env.GEMINI_API_KEY
 * 2. Node.js backend env variables: process.env.VITE_GEMINI_API_KEY or process.env.GEMINI_API_KEY
 */
export const getGeminiApiKey = (): string => {
  // 1. Direct Vite compile-time literal access (Vite replaces `import.meta.env.VITE_` at build time)
  try {
    const directViteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (directViteKey && typeof directViteKey === "string" && directViteKey.trim()) {
      return directViteKey.trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }

  // 2. Fallback to GEMINI_API_KEY if defined
  try {
    const directAltKey = (import.meta.env as any).GEMINI_API_KEY;
    if (directAltKey && typeof directAltKey === "string" && directAltKey.trim()) {
      return directAltKey.trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }

  // 3. Node.js backend env variables: process.env.VITE_GEMINI_API_KEY or process.env.GEMINI_API_KEY
  try {
    if (typeof process !== "undefined" && process?.env) {
      const processKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (processKey && typeof processKey === "string" && processKey.trim()) {
        return processKey.trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // ignore
  }

  return "";
};

/**
 * Masked helper for logging key status safely without exposing secrets.
 */
export const getMaskedApiKey = (key: string): string => {
  if (!key) return "None";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

/**
 * Returns an instance of GoogleGenAI initialized with the centralized API key.
 */
export const getAIClient = (): GoogleGenAI => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is not set. Please configure VITE_GEMINI_API_KEY in your .env file.");
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
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Executes a Gemini prompt with multi-tier resilience:
 * 1. Centralized API key from environment variables.
 * 2. Model cascade fallback (gemini-3-flash-preview -> gemini-3.8-flash -> gemini-2.0-flash).
 * 3. Exponential backoff retry on transient gateway dropouts / 502 Bad Gateway.
 * 4. Node.js server proxy fallback (/api/ai/generate) if direct browser network is blocked or key is server-only.
 */
export const executeGeminiPrompt = async (
  prompt: string,
  options: PromptExecutionOptions = {}
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  const { temperature = 0.7, maxOutputTokens, model = "gemini-3-flash-preview" } = options;

  // Build model cascade list: gemini-3-flash-preview (fastest/proven) -> gemini-3.8-flash -> gemini-2.0-flash
  const modelsToTry: string[] = [model, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-2.0-flash"].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

  let lastError: any = null;

  // Tier 1 & 2: Direct browser client call if client API key is available
  if (apiKey) {
    const client = new GoogleGenAI({ apiKey });

    for (const currentModel of modelsToTry) {
      const maxAttempts = 2;
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

          // If auth issue, break directly to proxy or raise
          if (
            msg.includes("api_key_invalid") ||
            msg.includes("401") ||
            msg.includes("403") ||
            msg.includes("unauthorized") ||
            msg.includes("permission_denied")
          ) {
            console.warn("[TeachEase AI] Direct API key authorization failed, checking server proxy...");
            break;
          }

          // If it's a 502 Bad Gateway / transient error, retry with delay
          if (isTransientOrGatewayError(err) && attempt < maxAttempts) {
            console.warn(`[TeachEase AI] Transient error on ${currentModel} (attempt ${attempt}/${maxAttempts}). Retrying in ${attempt * 1000}ms...`);
            await sleep(attempt * 1000);
            continue;
          }

          // Move to next model in fallback cascade
          if (modelsToTry.length > 1) {
            console.warn(`[TeachEase AI] Model ${currentModel} returned ${err.message}. Cascading to next fallback model...`);
          }
          break;
        }
      }
    }
  }

  // Tier 3: Server proxy fallback (/api/ai/generate) - resolves CORS, browser restrictions, and uses server-side .env
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        prompt,
        model,
        config: { temperature, maxOutputTokens }
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.text) {
        return data.text;
      }
    } else {
      const errData = await response.json().catch(() => ({}));
      if (errData?.error) {
        lastError = new Error(errData.error);
      }
    }
  } catch (proxyErr: any) {
    if (!lastError) {
      lastError = proxyErr;
    }
  }

  // Format a clear error message
  const rawMsg = lastError?.message || String(lastError || "");
  const lowerMsg = rawMsg.toLowerCase();

  if (!apiKey && !rawMsg) {
    throw new Error("Gemini API Key is not configured. Please verify VITE_GEMINI_API_KEY in your .env file.");
  }

  if (lowerMsg.includes("api_key_invalid") || lowerMsg.includes("invalid api key") || lowerMsg.includes("401") || lowerMsg.includes("403")) {
    throw new Error("Invalid Gemini API key or unauthorized. Please verify your VITE_GEMINI_API_KEY in .env.");
  }

  if (lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("resource_exhausted")) {
    throw new Error("Gemini API quota exceeded. Please check your Google AI Studio account quota or try again in a few moments.");
  }

  if (isTransientOrGatewayError(lastError)) {
    throw new Error(
      "Google Gemini Gateway (502 Bad Gateway): Google's model servers are temporarily experiencing high traffic. Please retry in a few moments."
    );
  }

  throw new Error(rawMsg || "AI content generation failed. Please check your internet connection and verify VITE_GEMINI_API_KEY in .env.");
};

/**
 * AI Assignment Generation
 */
export interface AssignmentOptions {
  subject: string;
  topic: string;
  difficulty: string;
  questionCount?: number;
  questionTypes?: string;
}

export const generateAssignment = async (
  optionsOrSubject: AssignmentOptions | string,
  topicParam?: string,
  difficultyParam?: string
): Promise<string> => {
  const options: AssignmentOptions =
    typeof optionsOrSubject === "string"
      ? {
        subject: optionsOrSubject,
        topic: topicParam || "",
        difficulty: difficultyParam || "Medium",
        questionCount: 5,
        questionTypes: "Mixed (MCQ, Short, Challenge)"
      }
      : optionsOrSubject;

  const { subject, topic, difficulty, questionCount = 5, questionTypes = "Mixed (MCQ, Short, Challenge)" } = options;

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
    temperature: 0.7
  });
};

/**
 * AI Lesson Plan Generation
 */
export const generateLessonPlan = async (subject: string, topic: string, classLevel: string): Promise<string> => {
  const prompt = `Create a lesson plan for subject "${subject}", topic "${topic}", for class level "${classLevel}". 
Include:
- Learning Objectives
- Required Materials
- Introduction (5 mins)
- Core Activities (30 mins)
- Conclusion/Assessment (10 mins)
Format as Markdown.`;

  return executeGeminiPrompt(prompt, {
    temperature: 0.7
  });
};

/**
 * AI Lecture Notes Generation
 */
export interface NotesOptions {
  subject: string;
  topic: string;
  detailLevel: string;
}

export const generateLectureNotes = async (
  optionsOrSubject: NotesOptions | string,
  topicParam?: string,
  detailLevelParam?: string
): Promise<string> => {
  const options: NotesOptions =
    typeof optionsOrSubject === "string"
      ? {
        subject: optionsOrSubject,
        topic: topicParam || "",
        detailLevel: detailLevelParam || "Comprehensive"
      }
      : optionsOrSubject;

  const { subject, topic, detailLevel } = options;

  const prompt = `You are a distinguished university professor delivering an in-depth academic lecture.
Generate comprehensive lecture notes for:
- Course Subject: ${subject}
- Lecture Topic: ${topic}
- Detail Level: ${detailLevel}

Requirements:
1. Executive Summary & Learning Outcomes
2. Theoretical Foundations & Key Definitions
3. Core Mechanisms, Algorithms, or Equations (with step-by-step mathematical or logical walkthroughs)
4. Real-world Engineering/Industry Case Studies & Applications
5. Comparative Analysis Table (e.g., Trade-offs, Strengths vs. Weaknesses)
6. Professor's "Gotchas & Exam Tips" (Common misconceptions students make)
7. Summary Key Takeaways and 3 Discussion Questions
8. Format in clean, readable Markdown with LaTeX-style notation where appropriate and bullet lists.`;

  return executeGeminiPrompt(prompt, {
    temperature: 0.6
  });
};

/**
 * AI Presentation / PPT Outline Generation
 */
export interface PPTOptions {
  subject: string;
  topic: string;
  slideCount?: number;
  detailLevel?: string;
}

export const generatePPTOptions = async (
  optionsOrSubject: PPTOptions | string,
  topicParam?: string,
  slideCountParam?: number
): Promise<string> => {
  const options: PPTOptions =
    typeof optionsOrSubject === "string"
      ? {
        subject: optionsOrSubject,
        topic: topicParam || "",
        slideCount: slideCountParam || 6,
        detailLevel: "Detailed"
      }
      : optionsOrSubject;

  const { subject, topic, slideCount = 6 } = options;

  const prompt = `You are an expert academic presentation designer.
Create a slide-by-slide presentation outline for:
- Subject: ${subject}
- Topic: ${topic}
- Total Slides: ${slideCount}

For EVERY slide (Slide 1 to Slide ${slideCount}), strictly provide:
### Slide [Number]: [Catchy Slide Title]
- **Key Concepts:** (3-4 crisp bullet points suitable for on-slide text)
- **Visual Suggestion:** (Describe an infographic, chart, diagram, or illustration to include)
- **Speaker Notes:** (2-3 sentences of what the professor should explain verbally)

Format cleanly in Markdown with dividers (---) between each slide.`;

  return executeGeminiPrompt(prompt, {
    temperature: 0.7
  });
};

// Aliases for compatibility with different module imports
export const generateNotes = generateLectureNotes;
export const generatePPTContent = generatePPTOptions;

