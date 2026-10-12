# InterviewIQ

InterviewIQ is a company-focused interview preparation app. Candidates can browse starter prompts, generate original practice questions with Gemini or Gemma 4, work in a Monaco editor, save attempts, and share first-hand interview experiences. Stories go through admin review before appearing publicly.

## Run locally

Requirements: Node.js 20+ and a MongoDB database (local or Atlas).

```powershell
cd server
npm install
npm run dev
```

Open [http://localhost:5000](http://localhost:5000). The server serves both the web app and API. It connects to MongoDB on startup and inserts the original starter question set once. Existing `server/.env` MongoDB and Gemini settings are used; keep that file private.

Add a strong random `JWT_SECRET` to `server/.env` for stable sessions and production use. The AI practice builder offers both the configured Gemini model and hosted Gemma 4 (`gemma-4-26b-a4b-it`) through the existing Google AI SDK and Gemini API key. To override the Gemma model, add:

```dotenv
JWT_SECRET=replace-with-a-long-random-secret
GEMINI_MODEL=gemini-2.5-flash
GEMMA_MODEL=gemma-4-26b-a4b-it
```

The Gemini key must have access to the selected model. If no AI key is configured, browsing and starter questions still work; generation and coaching are unavailable.

## Features

- Email and password registration/login, with scrypt password hashing and expiring signed bearer tokens.
- Authenticated generation and attempt tracking; user and admin route authorization.
- Company, difficulty, topic, and text search over original starter and generated questions.
- Interview experience submissions, public display after review, and an admin moderation queue.
- Monaco code editor with a textarea fallback. JavaScript can run in an isolated browser sandbox with a two-second timeout; other languages have syntax editing only until a trusted code-judge service is configured. The current runner does not execute hidden test cases or grade solutions.
- Gemini/Gemma AI interview coach endpoint at `POST /api/chat`.

To grant a user moderation access, update their MongoDB `users` document and set `role` to `admin` using your trusted database admin tools. Registration never allows clients to choose their role.

## Data and source policy

Starter and AI prompts are original practice material, not verified questions from a named employer. Community stories should be first-hand, should not contain confidential material, and remain pending until reviewed. The app links to public references when provided. It does not copy paid LeetCode or other premium question banks. Adding a source requires checking its terms and a reuse license; public accessibility or a permissive `robots.txt` alone does not grant republication rights.

## API overview

- `GET /api/health`, `GET /api/companies`, `GET /api/questions`, `GET /api/experiences`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/questions/generate`, `POST /api/attempts`, `GET /api/attempts`
- `POST /api/experiences`, `GET /api/admin/experiences`, `PATCH /api/admin/experiences/:id`
- `POST /api/chat`

Protected endpoints accept `Authorization: Bearer <token>`.
