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

- Gemini: `GEMINI_API_KEY` (aliases `GOOGLE_API_KEY`, `GOOGLE_AI_API_KEY`); default model `gemini-3.8-flash`; optional `GEMINI_MODEL`. If a model returns HTTP 404, the server tries `gemini-3.8-flash`, `gemini-3.5-flash-lite`, and `gemini-2.5-flash` (without repeating models) before moving to the next configured provider. Gemini 2.0 Flash is retired and is not used as a fallback. Optional `GEMINI_API_BASE_URL` overrides the API base. A 401/403 or quota error is reported rather than mislabelled as a missing model.
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


## Public internet access and installable app

Deploy this project as a **Web Service** on Render using `npm install` (or `npm ci` if a lockfile is present) and `npm start`. Render assigns a public HTTPS URL, which learners can open worldwide. The `render.yaml` file describes a starter service; connect the repository and branch in the Render dashboard and verify the health endpoint at `/api/health`. A deployment being Live does not by itself mean every AI provider is configured.

This project now includes a Progressive Web App manifest, install prompt, app icons and a service worker that caches the app shell. On supported browsers, use the Install button or the browser menu's **Install app / Add to Home screen** option. Offline support is limited to the cached interface and static assets: tutor calls and server-backed progress still require a working internet connection. Service-worker installation requires HTTPS (Render provides HTTPS) or localhost.

## Downloading and important limits

The source project can be downloaded as a ZIP from the repository or release package. A PWA is not the same as an Android APK; a signed APK would require a separate Android packaging and testing step.

**Account and data warning:** this foundation still does not have real authenticated accounts. The current learner ID is client-generated and is not an access-control boundary. Do not store sensitive student information or treat records as private between users. The JSON file store may not persist across all Render restarts/deployments. Before a public launch with real student accounts, implement verified authentication, server-side authorization, persistent database storage with tenant isolation, and appropriate privacy controls.


## Experimental account foundation (v2.1.0)

Open `/accounts.html` or use the **Account** link in the app to access the account centre. The account API supports one-time Creator setup, sign-in/sign-out, server-side password hashing with scrypt, HttpOnly SameSite session cookies, role-aware account creation, institution-scoped account listings, account disabling, and a Creator-only audit log. Supported role IDs are `creator`, `institution_admin`, `teacher`, `learner`, `parent_guardian`, and `support_staff`.

### Creator setup

Before the first setup, configure a long random `CREATOR_SETUP_SECRET` in Render's environment settings. Keep it private; never commit it to GitHub or paste it into public issues. Visit `/accounts.html`, create the Creator account once, and store its login details securely. Creator setup is rejected once any account exists. If the secret is not configured, Creator setup is intentionally unavailable.

### Important security status

This is an **experimental account foundation**, not a public-launch-ready identity system. Account records currently use a local JSON file and login sessions are held in server memory; this means accounts may not survive ephemeral hosting storage and users are signed out on server restart. Email verification, password change/reset, MFA, robust login throttling, persistent sessions, database-backed transactions, and full account-to-learning-data ownership are not implemented. In particular, the original learning/progress endpoints still accept anonymous learner IDs and are not yet bound to these account sessions. Do not use real student records or sensitive information yet. Before launch, move accounts and learning data to a persistent PostgreSQL/Supabase database with row-level security, enforce authentication/ownership on every learner endpoint, add rate limiting and recovery controls, and run a security review.

Run `npm test` to run the automated checks. The tests cover the one-time Creator setup gate, invalid credentials, password sign-in, role restrictions, institution-scoped user creation/listing, and audit-log access.


## StudyWise 2.1.1 — personalised Settings update

- Added a dedicated **Settings** item in the learning-space side menu while keeping **Learner profile** separate.
- Settings shows role-aware sections for Creator/Super Admin, Institution Administrator, Teacher, Learner, Parent/Guardian, Support Staff, and signed-out visitors.
- Personal preferences include light/dark appearance, preferred language, text size, voice/read-aloud preference, and a study-reminder preference.
- The preferences currently save in this browser/device only. Cross-device sync and actual notification delivery require the later database/account integration. Language selection is a saved preference; it does not yet translate every part of the app.
- Creator API credentials remain server-side environment variables and must never be entered into browser settings.
- Service-worker cache version was bumped so the new Settings interface can replace the older cached shell after deployment.

### Settings validation

The test suite includes checks for the separate navigation item, role-aware settings sections, preference controls, and responsive/accessibility styling. These tests verify the Settings interface foundation; they do not make the overall starter app production-ready.


## StudyWise 2.1.2 — AI Tutor reliability patch

- Gemini model HTTP 404 now triggers a retry against supported fallback model names before provider failover.
- Gemini API error messages are included where the provider returns a useful message, making Render logs and Tutor errors more actionable.
- `GEMINI_API_BASE_URL` is configurable for diagnostics or provider-compatible deployments. Leave it at the official default unless you have a specific reason to change it.
- This code-level fix cannot guarantee live answers without a valid server-side API key, model access, quota, and provider availability. If all providers fail, verify the key/model and configure a fallback provider. Never place API keys in frontend code or commit them to GitHub.


## Groq fallback (2.1.4)

The server can use `GROQ_API_KEY` with Groq's OpenAI-compatible API. Default provider order is Gemini, Groq, Grok (xAI), then OpenAI. If a provider request fails, the Tutor continues to the next configured provider. Optional `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`; confirm current model availability and quota in your Groq console. Set `AI_PROVIDER_ORDER` to override the order. Never commit API keys.


## Version 2.1.5 Tutor reliability fix
- Adds a 25-second timeout to AI provider requests so a stalled provider cannot keep the server request waiting indefinitely.
- Shows tutor errors in the page and restores the submit button instead of leaving the page on “Working on your explanation…”.
- Keeps provider API keys in Render environment variables; never add secrets to this ZIP or GitHub.


## Version 2.1.6 — Tutor answer formatting

The browser Tutor now formats common Markdown headings, bold/italic text, ordered and unordered lists, horizontal separators, Markdown tables, and simple display equations into accessible HTML. The renderer escapes user/provider text before adding formatting markup; CSS makes answer tables scroll on small screens and improves spacing on phones. This is a presentation-only update and does not change AI provider credentials or production configuration.
