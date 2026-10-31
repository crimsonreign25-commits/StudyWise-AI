# StudyWise AI 2.1.22 — Unified sign-in and learning access

## What changed
- The main landing page keeps clear Sign In and Create Account links to the shared Account Centre (`/accounts.html`).
- The main learning app checks the same server session (`/api/accounts/me`) and displays the signed-in name and role.
- Learner sessions use the authenticated Supabase user ID for progress instead of an anonymous browser-generated ID.
- The Creator can enter the learning experience using a separate progress profile keyed to the Creator account ID. This does not grant Creator privileges to public sign-up.
- Other staff/guardian roles can authenticate, but learner-private APIs remain restricted until their dedicated role workspaces are implemented.
- Public self-registration remains learner-only; privileged roles are created through authorised Account Centre workflows.

## Deployment
Upload the archive contents to the `studywise-ai-2` branch with `server.js`, `package.json`, and `public/` at repository root. Deploy only the development Render service first. Keep production unchanged until smoke tests pass.

## Smoke tests
1. Open `/accounts.html`, sign in as the existing Creator, then tap Back to StudyWise learning.
2. On `/`, tap Continue as Guest only if you intentionally want guest access; otherwise use the Account link to sign in.
3. The app header should show the Creator name and role.
4. Open Overview, AI Tutor, Practice, Notes and Planner. Creator learning data is isolated under the Creator auth user ID.
5. Sign out from Account Centre and verify the learning app no longer shows the signed-in identity.
6. Create a learner through public Sign Up and verify learner sign-in and account-bound progress.

This release does not claim that teacher, institution administrator, parent/guardian, or support staff role-specific workspaces are complete. Their authentication is supported; their dedicated tools require separate implementation and testing.
