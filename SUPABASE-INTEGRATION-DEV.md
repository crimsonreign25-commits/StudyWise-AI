# StudyWise AI — Supabase development integration

This development-stage change connects learner sign-up and sign-in to Supabase Auth using `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the server. The publishable key is not a secret; do not add a service-role key to browser code.

## Required one-time database step

1. Open the StudyWise-AI project in Supabase.
2. Open **SQL Editor** and create a new query.
3. Paste and run `supabase/studywise-auth.sql`.
4. Confirm the query completes without errors.
5. In Supabase Authentication settings, confirm email confirmation is enabled if you want verified emails before sign-in. The app will show a confirmation message when Supabase does not return an active session at sign-up.
6. Keep the Site URL set to `https://studywise-ai-1.onrender.com` for development and keep its redirect URL configured.

## What is integrated

- Learner sign-up through Supabase Auth.
- Learner password sign-in through Supabase Auth.
- Profile lookup under the existing row-level security policy.
- Server-side, HttpOnly session cookie; the access token is kept in server memory, not localStorage.
- Logout calls Supabase Auth when a Supabase session is active.
- Public sign-ups receive only the `learner` role via a database trigger.

## Important limitations before production

- Existing JSON-file accounts are **not automatically migrated** to Supabase. Their password hashes cannot be imported as Supabase passwords. Keep production untouched until a migration/re-enrollment plan is agreed.
- Creator setup and account-management endpoints use Supabase Admin API only when `SUPABASE_SERVICE_ROLE_KEY` is configured on the server. Without it, those endpoints return a configuration error rather than silently creating legacy accounts.
- Password recovery UI is not yet connected to Supabase's recovery flow.
- Session storage is in-memory and is cleared by a Render restart; durable session handling and refresh-token lifecycle need additional work.
- The learning-progress endpoint and all account-sensitive routes still need a complete authorization review before real student data or production rollout.
- Do not put a Supabase service-role key in frontend code or expose it in logs.

## Verify on the development deployment

1. Wait for Render to deploy the `studywise-ai-2` branch.
2. Visit `https://studywise-ai-1.onrender.com/api/health`. Confirm `supabaseConfigured: true` and version `2.1.21`.
3. Run the SQL trigger before attempting a new sign-up; otherwise profile lookup may fail after confirmation/sign-in.
4. Create a test learner account with an email inbox you control. If email confirmation is enabled, confirm the email, then sign in.
5. Confirm `/api/accounts/me` returns the learner profile after sign-in.
6. Do not change the production service until these tests pass and the remaining limitations are addressed.


## Auth hardening update (2.1.20)

- Authenticated learner requests now resolve their private learning record from the signed-in account ID, ignoring a client-supplied `learnerId`. This applies to progress, attempts, profile, error book, notes, and study plans.
- Non-learner roles receive HTTP 403 from learner-private data endpoints.
- Anonymous guest profiles remain supported for the existing guest learning flow. Guest profiles are not authenticated accounts and should not be treated as private long-term storage.
- The service-worker cache name was bumped so clients fetch the updated application shell.

Important remaining integration work: account administration endpoints (list/create/disable users and audit history) still use the legacy JSON account store. Do not treat Supabase-backed role management as fully complete yet. Creator promotion requires a server-side privileged Supabase operation and must not be implemented with the publishable key. Do not deploy this ZIP to production before completing and testing that remaining work on development.


## Account administration update (2.1.20 — development only)

For Supabase-backed Creator setup and account administration, add `SUPABASE_SERVICE_ROLE_KEY` to the **development Render service's Environment** settings. Copy it from the Supabase project's server-side API keys page. Never put this key in `public/`, browser JavaScript, GitHub, this ZIP's source files, or a message. If the key has ever been committed or exposed, rotate it in Supabase.

- Creator setup checks the Supabase `profiles` table for an existing Creator before promoting the first account.
- Creator / Institution Administrator account creation uses the Supabase Admin API and writes the assigned role to `public.profiles`.
- Account listing reads Supabase profiles and maps their IDs to Supabase Auth users.
- Disabling an account applies a long-duration Supabase Auth ban. It does not delete the account.
- Audit events are still held in the app's local JSON audit file; they are not yet durable across multiple Render instances and are not yet stored in a Supabase audit table.
- The account-list endpoint currently reads up to 1,000 Auth users and 500 profiles per request; large installations need pagination.
- These changes have passed a Node syntax check. The existing test suite still has three unrelated/stale failures for speech text, theme choices, and the cache-version expectation. Test account flows in development before relying on them.

Do not enable production use until the development service has the server-side key configured and Creator creation, user creation, institution boundaries, account disabling, logout, and learner-data isolation have been verified with test accounts.
