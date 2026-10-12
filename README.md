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
GEMINI_RESEARCH_MODEL=gemini-3.8-flash
```

To enable execution, configure a Judge0 CE endpoint and credentials in `server/.env` (never expose these in the browser):

```dotenv
JUDGE0_API_URL=https://ce.judge0.com
JUDGE0_API_TOKEN=your-judge0-token
JUDGE0_API_USER=your-judge0-user
```

For a RapidAPI-hosted Judge0 instance, set `JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com` and `JUDGE0_RAPIDAPI_KEY`. The runner discovers installed language IDs from the configured instance. Without a working Judge0 instance/credential, the editor remains available but execution reports that the service is unavailable. Submitted source code and stdin are sent to that configured provider.

The Gemini key must have access to the selected model. If no AI key is configured, browsing and starter questions still work; generation and coaching are unavailable.

## Features

- Email and password registration/login, with scrypt password hashing and expiring signed bearer tokens.
- Authenticated generation and attempt tracking; user and admin route authorization.
- Company, difficulty, topic, and text search over original starter and generated questions.
- Persistent light and dark themes, initialized from the saved preference or the operating system setting; the Monaco editor follows the active theme.
- Authenticated, live company research using Gemini Google Search grounding. The UI links to the sources and labels candidate reports as unverified and time-sensitive; findings are not copied into the database.
- Interview experience submissions, public display after review, and an admin moderation queue.
- Admin JSON dataset import with company multi-tags, source/license attribution, exact duplicate merging, and near-duplicate review before publication.
- Company question catalogs can be built toward 100 unique questions through successive Gemini batches, with one grounded company-research pass guiding the topic mix. These are original practice questions, not leaked or verified questions from the employer.
- Monaco code editor with a textarea fallback. C, C++, C#, Java, JavaScript, TypeScript, Python 3, Go, Rust, Ruby, and PHP execute through a separate Judge0 service with resource limits and standard input/output.
- Gemini/Gemma AI interview coach endpoint at `POST /api/chat`.

To grant a user moderation access, update their MongoDB `users` document and set `role` to `admin` using your trusted database admin tools. Registration never allows clients to choose their role.

## Importing question catalogs

No crawler is enabled for LeetCode, CodeChef, GeeksforGeeks, or takeUforward. Their current terms restrict automated access, copying, or republishing without permission. For those sources, import problem text only when you have written redistribution permission; otherwise add a source link and an original InterviewIQ practice question. LeetCode prohibits crawling/scraping, GeeksforGeeks prohibits automated collection and unauthorized reuse, and takeUforward prohibits automated scraping. Check current terms before each dataset import.

An admin can use **Import licensed dataset** from the question bank. The accepted shape is shown in [`server/public/question-import-template.json`](server/public/question-import-template.json). Each record needs one or more `companyTags`, a title, and a problem prompt. Include a license URL or written-permission reference; the server records source metadata. Exact problem text/source-URL matches are merged and company tags/source references are added. High-similarity candidates are skipped and returned for review so near-duplicates are not silently added. Browse every imported page with the question bank's **Load more** control.

The project does not contain bulk datasets for those third-party sites. Gemini can build a company catalog toward 100 original practice prompts in batches, and public source references can be added by authorized imports. Admin import JSON accepts optional `sourceAskedAt` and `sourcePostedAt` timestamps; cards show the source logo, exact available timestamp, or indicate the date was not listed.

The **Find Reddit / X reports** action uses Gemini's Google Search grounding to discover current public report links and platform-tagged collection pages. This requires a Gemini model that supports Google Search grounding; set `GEMINI_RESEARCH_MODEL` to override the default `gemini-3.8-flash`. Grounded search is billed by Google according to the enabled model and search queries. X's official API is pay-per-use; Reddit API access and display/use of user content are governed by Reddit's current developer and data terms. This app does not call either platform's API or scrape their pages. Use their official APIs only after registering and accepting applicable terms; do not import/persist post text unless your app has the required rights.

## Data and source policy

Starter and AI prompts are original practice material, not verified questions from a named employer. Community stories should be first-hand, should not contain confidential material, and remain pending until reviewed. The app links to public references when provided. It does not copy paid LeetCode or other premium question banks. Adding a source requires checking its terms and a reuse license; public accessibility or a permissive `robots.txt` alone does not grant republication rights.

## API overview

- `GET /api/health`, `GET /api/companies`, `GET /api/questions`, `GET /api/experiences`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/questions/generate` (builds a company catalog toward 100), `POST /api/attempts`, `GET /api/attempts`
- `GET /api/runner/languages`, `POST /api/runner/execute` (authenticated; Judge0 required)
- `POST /api/experiences`, `GET /api/admin/experiences`, `PATCH /api/admin/experiences/:id`
- `POST /api/admin/import/questions` (admin only; license/permission attestation required)
- `POST /api/research/company` (authenticated; Gemini Search grounded report with citations)
- `POST /api/chat`

Protected endpoints accept `Authorization: Bearer <token>`.
