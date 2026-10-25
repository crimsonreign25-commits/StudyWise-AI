# StudyWise AI 2.0 — Foundation Upgrade

A mobile-first learning and revision web app, designed initially for Kenyan secondary-school learners. It includes a dashboard, subject practice quizzes, answer explanations, an error book, personal notes, a study planner, a learner profile, and an optional AI tutor API integration.

> **Important:** Included questions are original sample practice questions, not official KNEC papers. This first version is a working starter release, not yet a production-ready multi-user education service.

## Requirements

- Node.js 20 or newer (Render configuration targets Node 22)
- npm (bundled with Node)
- Optional: Gemini, Grok (xAI), or OpenAI API key to enable live tutor responses

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:10000`. The server uses Node's built-in modules, so there are no runtime npm dependencies to install. You can also run `npm test` to run the starter test suite.

To enable live AI, configure one or more provider keys in your hosting environment. Gemini is tried first by default, then Grok, then OpenAI. The server checks configured providers and attempts the next provider if one fails. This does not make paid APIs free; provider billing, free-tier quotas, model availability and terms still apply. Never commit `.env` or put API keys in browser JavaScript.

- Gemini: `GEMINI_API_KEY` (aliases `GOOGLE_API_KEY`, `GOOGLE_AI_API_KEY`); default model `gemini-2.5-flash`; optional `GEMINI_MODEL`.
- Grok: `XAI_API_KEY` (alias `GROK_API_KEY`); default model `grok-3-mini`; optional `GROK_MODEL`.
- OpenAI: `OPENAI_API_KEY`; default model `gpt-4o-mini`; optional `OPENAI_MODEL` (or legacy `AI_MODEL`) and `OPENAI_BASE_URL`.
- Optional provider order: `AI_PROVIDER_ORDER=gemini,grok,openai`.

If no key is configured, the tutor labels its response as demo guidance. If all configured providers fail, the app returns an explicit error instead of silently pretending a live answer was generated.

## Deploy to Render

1. Create a new GitHub repository for this project and upload the **contents** of this folder to the repository root.
2. In Render, choose **New → Web Service**, connect that repository, and use:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. Add your Gemini and/or Grok keys in Render Environment settings; OpenAI is optional. Do not commit secrets. Save and deploy the environment changes.
4. Deploy and check `https://YOUR-SERVICE.onrender.com/api/health`. A successful response includes `ok: true` and `aiConfigured`.
5. Open the service URL and test a quiz, error-book entry, note, and study plan.

`render.yaml` is included as a Blueprint reference. Render's ephemeral filesystem may not preserve the JSON progress file across restarts or deployments on all service plans. For a real public launch, migrate progress to Supabase/Postgres and configure durable storage or managed database persistence.

## API endpoints

- `GET /api/health` — health and AI configuration status
- `GET /api/curriculum` — starter curriculum directory, education-level options and subjects
- `GET /api/health` — reports which provider names are configured (never returns keys)
- `GET /api/quiz?subject=Mathematics` — original practice questions (answers are not exposed); optional `topic` and `paper` filters
- `POST /api/attempt` — check and persist an answer attempt
- `GET /api/progress?learnerId=...` — read progress for the anonymous learner ID
- `POST /api/tutor` — demo explanation or live AI response
- `POST /api/profile` — save learner profile
- `POST /api/notes` and `POST /api/notes/delete` — notes
- `POST /api/plan` — generate and save a study plan
- `POST /api/error-book/remove` — mark an error-book question reviewed

## StudyWise 2.0 foundation update

- Added server-side provider detection and fallback for Gemini, Grok and optional OpenAI.
- Added a starter global curriculum directory for Kenya CBC/CBE, Cambridge/IGCSE, IB, UK nations, US, South Africa, Nigeria, India, Tanzania, Uganda, Rwanda, Ghana, Australia, Canada, New Zealand, Singapore and global self-directed learning. These are directory entries, **not yet fully verified syllabus integrations**.
- Expanded original sample question bank from 9 to 26 questions and added topic/paper metadata to selected items.
- Added splash screen, light/dark appearance preference, browser speech input/output where supported, and local last-view continuity.
- The global directory and sample question bank are only a foundation. Curriculum mapping, larger reviewed question banks, topic mastery reports, retesting and official paper mapping remain follow-up work.
- The current profile still uses an anonymous device identifier. Secure student, parent, teacher, organisation and admin accounts are **not implemented in this release**. Do not use this release for real student accounts or sensitive institutional records.

## Current limitations before public launch

- No authentication, password reset, or verified student/teacher accounts yet.
- The anonymous learner ID is a convenience identifier, **not a security boundary**; do not use this JSON-storage version for sensitive or multi-user student records.
- Progress uses a local JSON file. Move to Supabase/Postgres with row-level security before public multi-user use.
- No subscription or payment processing is implemented.
- AI tutor answers depend on a configured third-party provider, its pricing, availability, and terms. Review output for accuracy.
- Curriculum alignment and official past-paper content need a separate verified content pipeline and appropriate rights.

## Project layout

```text
studywise-ai/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                  # generated progress store; not committed
├── test/app.test.js
├── src-content.js         # sample curriculum, subjects and practice questions
├── server.js
├── package.json
├── render.yaml
├── .env.example
└── README.md
```
