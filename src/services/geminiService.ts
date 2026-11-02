import { GoogleGenAI } from "@google/genai";

/**
 * Resolves the centralized Gemini API key from environment variables.
 * Precedence:
 * 1. Vite frontend env variable: import.meta.env.VITE_GEMINI_API_KEY
 * 2. Node.js backend env variables: process.env.VITE_GEMINI_API_KEY or process.env.GEMINI_API_KEY
 */
export const getGeminiApiKey = (): string => {
  // Check Vite env
  try {
    const envKey = import.meta.env?.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === "string" && envKey.trim()) {
      return envKey.trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }

  // Check Node.js / process env
  try {
    const processKey = (process?.env as any)?.VITE_GEMINI_API_KEY || (process?.env as any)?.GEMINI_API_KEY;
    if (processKey && typeof processKey === "string" && processKey.trim()) {
      return processKey.trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }

  return "";
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
 * 2. Model cascade fallback (gemini-3.8-flash -> gemini-2.0-flash -> gemini-1.5-flash).
 * 3. Exponential backoff retry on transient gateway dropouts / 502 Bad Gateway.
 * 4. Local Node.js server proxy fallback (/api/ai/generate) if direct browser network is blocked.
 */
export const executeGeminiPrompt = async (
  prompt: string,
  options: PromptExecutionOptions = {}
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is not set. Please configure VITE_GEMINI_API_KEY in your .env file.");
  }

  const { temperature = 0.7, maxOutputTokens, model = "gemini-3-flash-preview" } = options;

  // Build model cascade list: gemini-3-flash-preview (fastest/proven) -> gemini-3.8-flash -> gemini-3.5-flash
  const modelsToTry: string[] = [model, "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.5-flash"].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

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
          msg.includes("unauthorized") ||
          msg.includes("permission_denied")
        ) {
          throw new Error("Invalid Gemini API key or unauthorized. Please verify your VITE_GEMINI_API_KEY in .env.");
        }

        // If it's a 502 Bad Gateway / transient error, retry with delay
        if (isTransientOrGatewayError(err) && attempt < maxAttempts) {
          console.warn(`[TeachEase AI] Gateway error on ${currentModel} (attempt ${attempt}/${maxAttempts}). Retrying in ${attempt * 1200}ms...`);
          await sleep(attempt * 1200);
          continue;
        }

        // Move to next model in fallback cascade
        if (modelsToTry.length > 1) {
          console.warn(`[TeachEase AI] Model ${currentModel} error: ${err.message}. Cascading to next fallback model...`);
        }
        break;
      }
    }
  }

  // Tier 3: Local Node.js server proxy fallback (/api/ai/generate)
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    }
  } catch {
    // Server proxy route not reachable or in static mode, fallback to original error
  }

  // Format a clear error message
  const rawMsg = lastError?.message || String(lastError || "Unknown generation error");
  if (isTransientOrGatewayError(lastError)) {
    throw new Error(
      "Google Gemini Gateway (502 Bad Gateway): Google's model servers are temporarily experiencing high traffic. Please retry in a few moments."
    );
  }

  throw new Error(`Generation failed: ${rawMsg}`);
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
 * AI Notes Generation
 */
export interface NotesOptions {
  subject: string;
  topic: string;
  detailLevel?: string;
}

export const generateNotes = async (
  optionsOrSubject: NotesOptions | string,
  topicParam?: string
): Promise<string> => {
  const options: NotesOptions =
    typeof optionsOrSubject === "string"
      ? {
          subject: optionsOrSubject,
          topic: topicParam || "",
          detailLevel: "Comprehensive Academic Lecture Notes"
        }
      : optionsOrSubject;

  const { subject, topic, detailLevel = "Comprehensive Academic Lecture Notes" } = options;

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
    temperature: 0.7
  });
};

/**
 * AI PPT Content Generation
 */
export interface PPTOptions {
  subject: string;
  topic: string;
  slideCount?: number;
  detailLevel?: string;
}

export const generatePPTContent = async (optionsOrTopic: PPTOptions | string): Promise<string> => {
  const options: PPTOptions =
    typeof optionsOrTopic === "string"
      ? {
          subject: "General",
          topic: optionsOrTopic,
          slideCount: 6,
          detailLevel: "Detailed Academic Lecture"
        }
      : optionsOrTopic;

  const { subject = "General", topic, slideCount = 6, detailLevel = "Detailed Academic Lecture" } = options;

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
    temperature: 0.7
  });
};
