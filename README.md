# StudyWise AI 2.0 — learning and security foundation

StudyWise AI is a mobile-first learning platform foundation designed first for Kenyan secondary-school/KCSE revision and expandable to other school systems, vocational learning, college, university and lifelong learning.

## Included in this upgrade

- Existing learning dashboard, subject directory, original practice questions, explanations, progress, error book, notes and study planner.
- AI tutor integration for Gemini, Groq, Grok/xAI and OpenAI. Keys stay on the server; provider order is configurable. API availability, model access and billing depend on the provider account.
- Sign-up and sign-in using server-side password hashing (`scrypt`) and opaque, hashed session tokens in PostgreSQL.
- HttpOnly, Secure, SameSite session cookies; sign-out; basic per-IP account-attempt throttling.
- Creator bootstrap protected by a private deployment secret and blocked after a creator exists. Public sign-up always creates a learner account; it cannot select an elevated role.
- Role records for creator, institution administrator, teacher, learner, parent/guardian and support staff; restricted role assignment, institution records, and audit events for role/institution changes and account sign-in/registration.
- Eight visual theme categories expanded to a 50-choice theme gallery, saved locally on the current device.
- Global curriculum directory and age-appropriate tutor prompt, while making clear that a directory entry does not mean a syllabus has been fully verified.
- Tests for curriculum/practice data and checks for the security foundation.

## Important status: foundation, not yet a full production school platform

This release is a meaningful security and account foundation, **not a completed production-grade multi-tenant education service**. Before inviting real students, finish and independently review the following:

1. Move progress, notes, plans and error-book data from `data/progress.json` into PostgreSQL tables with ownership/institution foreign keys and transaction-based access controls. The current progress store is keyed by authenticated account ID, but remains a JSON file and may be ephemeral on Render.
2. Build complete teacher/class, parent-child consent/linking, support-staff, institution onboarding and creator-management screens. Teacher/parent access to another learner is deliberately not granted by the current endpoints.
3. Add verified email, password reset/recovery, account deletion/export workflows, consent and age-appropriate privacy notices, retention rules, backups and incident response.
4. Add stronger deployment-grade abuse controls (distributed rate limits, CSRF/origin policy, monitoring, security review and restore drills). The current per-process login throttling is a basic first layer, not a substitute for a managed control.
5. Add automated integration tests against a real disposable PostgreSQL database and run a security review before launch. Current tests include source-level security checks and are not a penetration test.
6. Expand reviewed curriculum maps and question banks. Sample practice questions are original learning content and are not official KNEC examination papers.

Do not use this foundation to store highly sensitive student or medical data. Collect only the information needed to teach. Follow applicable privacy and child-protection requirements before onboarding minors or institutions.

## Requirements

- Node.js 20+ (Render configuration targets Node 22)
- npm
- Managed PostgreSQL database (required for account/authentication routes)
- Optional AI API key(s)

## Run and test

```bash
npm install
cp .env.example .env
npm test
npm start
```

Set the environment variables through your host's secret/environment settings, not in GitHub or browser code. Account access is intentionally unavailable if `DATABASE_URL` is not configured.

## Render deployment for the new branch/service

Keep the existing live service unchanged. Apply this ZIP only to the separate `studywise-ai-2` branch and the new Render service.

1. Create a managed PostgreSQL database in Render and copy its **internal connection string** into the new web service as `DATABASE_URL`.
2. Set `CREATOR_BOOTSTRAP_SECRET` to a long random secret (at least 32 random characters). Keep it private; do not commit it, paste it into public issues, or put it in frontend code. Once the creator account has been created, the endpoint refuses to bootstrap another creator.
3. Set the build command to `npm install`, start command to `npm start`, and health check to `/api/health`.
4. Add any AI provider keys you have chosen: `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, and/or `OPENAI_API_KEY`. They are optional for the account layer. Use `AI_PROVIDER_ORDER=gemini,groq,grok,openai` to choose fallback order.
5. Deploy the new branch/service. Check `/api/health`; it reports whether the database and AI providers are configured, but never returns secret values.
6. Open the site and choose **Creator setup** for the one-time creator account. Enter the deployment secret, creator display name, email and a strong unique password. After bootstrap, use ordinary sign-in.
7. Test account creation/sign-in/sign-out, learner progress ownership, role assignment, institution creation and audit access before inviting anyone else.

If a deployment is missing the database, account and private-record routes return a setup error rather than falling back to anonymous access.

## Environment variables

- `DATABASE_URL` — PostgreSQL connection string; required for account/role features.
- `CREATOR_BOOTSTRAP_SECRET` — private one-time creator setup secret.
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY` — optional server-side AI credentials.
- `GEMINI_MODEL`, `GROQ_MODEL`, `GROK_MODEL`, `OPENAI_MODEL` — optional model choices.
- `AI_PROVIDER_ORDER` — optional comma-separated provider order.
- `ALLOWED_ORIGIN` — optional comma-separated origin allowlist if serving the API separately.
- `PORT` — hosting port; Render sets this automatically.

## API overview

Public: `GET /api/health`, `GET /api/curriculum`, `GET /api/quiz`, `POST /api/tutor`, `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, and one-time `POST /api/auth/bootstrap-creator`.

Authenticated learning: `GET /api/progress`, `POST /api/attempt`, `POST /api/profile`, `POST /api/error-book/remove`, `POST /api/notes`, `POST /api/notes/delete`, `POST /api/plan`.

Restricted administration: `POST /api/admin/institutions`, `GET /api/admin/users`, `POST /api/admin/assign-role`, `GET /api/admin/audit`.

## Project layout

```text
studywise-ai/
├── public/                  # app interface, CSS, browser JavaScript
├── data/                    # current progress JSON store; migrate before production
├── test/                    # automated tests
├── src-content.js           # starter curriculum and original sample questions
├── server.js                # API, authentication, role gates and AI providers
├── package.json
├── render.yaml
├── .env.example
└── README.md
```
