# StudyWise AI account fix — v2.1.21

## Included
- Creator setup status checks the Supabase `profiles` table for an existing `creator` role instead of assuming setup is complete whenever the admin key exists. This keeps one-time Creator registration closed if a Creator profile already exists.
- Accessible Show/Hide controls added to password fields on the account centre (Creator setup, sign in, learner sign-up, and managed-account creation).
- App health version and service-worker cache version bumped.
- Archive contains one project root only; the duplicate nested `studywise-ai/` and `sw/` copies are intentionally excluded so ZIP upload tools do not accidentally publish an older nested app.

## Deploy to development only first
1. Upload the **contents** of this archive to the root of the GitHub repository on branch `studywise-ai-2` (the `server.js`, `package.json`, `public/`, and other project files should be directly at repository root).
2. Wait for Render development service `studywise-ai-1` to deploy successfully.
3. Open `https://studywise-ai-1.onrender.com/api/health`; confirm version `2.1.21`.
4. Open `https://studywise-ai-1.onrender.com/api/accounts/status`. With Supabase account administration configured, it now checks whether a Creator profile already exists. If no Creator profile exists, `setupRequired` should be `true`; if one exists, it should be `false`.
5. Open `https://studywise-ai-1.onrender.com/accounts.html` and use Show/Hide beside the password fields.

## Security and test notes
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `CREATOR_SETUP_SECRET` only in Render environment variables. Never put them in browser code or commit them. Rotate the Creator setup secret if it has been shared.
- The existing test suite currently has 26 passing tests and 3 pre-existing failures in `test/voice-readability.test.js` (speech playback message, theme-option expectation, and service-worker cache expectation). The changed JavaScript passes syntax checks; those unrelated failures are not represented as fixed here.
- Do not deploy to production until the development deployment and account status have been verified.
