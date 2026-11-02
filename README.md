# TeachEase — AI-Powered Professor Assistant

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSujalTotala%2Fteachease&env=VITE_GEMINI_API_KEY,VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY&project-name=teachease&repository-name=teachease)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-3.8%20Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

TeachEase is an intelligent, academic-grade assistant designed for educators and professors. It accelerates lesson preparation, coursework structuring, slide generation, and attendance management with deep AI reasoning and modern UI workflows.

---

## 🚀 One-Click Deploy to Vercel

Click the button below to deploy your own instance of TeachEase directly to Vercel with zero configuration:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSujalTotala%2Fteachease&env=VITE_GEMINI_API_KEY,VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY&project-name=teachease&repository-name=teachease)

### Deployment Steps:
1. Click the **Deploy with Vercel** button above.
2. Sign in with GitHub or GitLab to fork and clone the repository.
3. Configure the environment variables:
   - `VITE_GEMINI_API_KEY` *(Required for AI assignment, notes, and PPT generation)*
   - `VITE_SUPABASE_URL` *(Optional: Dual storage engine supports local storage out of the box)*
   - `VITE_SUPABASE_ANON_KEY` *(Optional)*
4. Click **Deploy**. Vercel will build and launch your application in under a minute!

---

## 🔄 Automatic Deployment with Git

Every commit pushed to the `main` branch of this repository automatically triggers a fresh production deployment on Vercel:

```bash
# Stage and commit your changes
git add .
git commit -m "feat: your new feature"

# Push to deploy automatically on Vercel
git push origin main
```

---

## 🛠️ Deploying via Vercel CLI

You can also deploy manually from your terminal using the Vercel CLI:

```bash
# 1. Install or run Vercel CLI
npx vercel login

# 2. Deploy a preview build
npx vercel

# 3. Deploy directly to production
npx vercel --prod
```

---

## ⚙️ Environment Variables

| Variable | Description | Required |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/) | Yes (Powers assignments, notes, and PPT generation) |
| `VITE_SUPABASE_URL` | Supabase Project URL | Optional (Local fallback available) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anonymous Public Key | Optional |

> **Note on AI Key:** TeachEase uses a centralized Gemini API key configured in `.env` (`VITE_GEMINI_API_KEY`) to power AI generation across assignments, lecture notes, and presentation outlines with automatic model cascade (`gemini-3.8-flash` -> `gemini-2.0-flash` -> `gemini-1.5-flash`).

---

## 💻 Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SujalTotala/teachease.git
   cd teachease
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

4. **Build production bundle:**
   ```bash
   npm run build
   ```

---

## 🌟 Key Features

- **AI Assignment Generator:** Generates structured assignments, rubrics, and marks schemes with customizable question types.
- **AI Lecture Notes:** Produces high-yield, comprehensive academic lecture notes with learning objectives.
- **AI Presentation & PPT Content:** Generates slide-by-slide outlines and speaker notes.
- **Resilient AI Cascade:** Powered by Gemini 3.8 Flash with automatic retries and fallback models.
- **Biometric Attendance:** Face detection attendance logging using `face-api.js`.
- **Dual Storage Engine:** Seamless switching between LocalStorage/IndexedDB and Supabase cloud sync.
