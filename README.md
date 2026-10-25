# StudyWise AI

A mobile-first learning and revision web app, designed initially for Kenyan secondary-school learners. It includes a dashboard, subject practice quizzes, answer explanations, an error book, personal notes, a study planner, a learner profile, and an optional AI tutor API integration.

> **Important:** Included questions are original sample practice questions, not official KNEC papers. This first version is a working starter release, not yet a production-ready multi-user education service.

## Requirements

- Node.js 20 or newer (Render configuration targets Node 22)
- npm (bundled with Node)
- Optional: an API key for a compatible OpenAI chat-completions endpoint to enable live tutor responses

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:10000`. The server uses Node's built-in modules, so there are no runtime npm dependencies to install. You can also run `npm test` to run the starter test suite.

To enable live AI, put your key in `.env` as `OPENAI_API_KEY=...`. Never commit `.env` or put API keys in browser JavaScript. Set `OPENAI_BASE_URL` and `AI_MODEL` to match your provider. If no key is configured, the app clearly labels its tutor as demo mode and returns built-in general guidance rather than pretending to be a live AI model.

## Deploy to Render

1. Create a new GitHub repository for this project and upload the **contents** of this folder to the repository root.
2. In Render, choose **New → Web Service**, connect that repository, and use:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. Add `OPENAI_API_KEY` in Render's Environment settings if live AI is wanted. Add other provider settings as needed. Do not commit secrets.
4. Deploy and check `https://YOUR-SERVICE.onrender.com/api/health`. A successful response includes `ok: true` and `aiConfigured`.
5. Open the service URL and test a quiz, error-book entry, note, and study plan.

`render.yaml` is included as a Blueprint reference. Render's ephemeral filesystem may not preserve the JSON progress file across restarts or deployments on all service plans. For a real public launch, migrate progress to Supabase/Postgres and configure durable storage or managed database persistence.

## API endpoints

- `GET /api/health` — health and AI configuration status
- `GET /api/curriculum` — curriculum options and subjects
- `GET /api/quiz?subject=Mathematics` — original practice questions (answers are not exposed)
- `POST /api/attempt` — check and persist an answer attempt
- `GET /api/progress?learnerId=...` — read progress for the anonymous learner ID
- `POST /api/tutor` — demo explanation or live AI response
- `POST /api/profile` — save learner profile
- `POST /api/notes` and `POST /api/notes/delete` — notes
- `POST /api/plan` — generate and save a study plan
- `POST /api/error-book/remove` — mark an error-book question reviewed

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
