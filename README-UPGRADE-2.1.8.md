# StudyWise AI 2.1.8 — Inclusive Tutor + Revision Library

This ZIP contains the **project files at the ZIP root** (not inside an extra project folder). It is based on the previous StudyWise AI 2.1.7 package and includes a fix for the revision-resource tutor prompt initialization order.

## Included
- Existing StudyWise app, account roles, PWA, API and quiz features from the previous project.
- Improved Tutor answer formatting for Markdown lists, tables, code, headings and readable maths.
- More inclusive starter catalogue of school subjects, languages, technical/TVET areas and higher-education course families.
- `GET /api/curriculum` endpoint for the catalogue.
- `GET /api/resources` endpoint and `resources/index.json` metadata index.
- Resource retrieval only for records marked `public-domain`, `licensed`, `permission-granted`, or `link-only`.
- Safer tutor instructions: generated practice is not misrepresented as an official past paper; predictions are not guarantees.
- Fix: revision resources are loaded before the tutor system prompt references them.

## Important limitation
The resource index starts empty. This ZIP does **not** magically include every KCSE past paper, marking scheme, revision note, topical question, prediction, or presentation. Add real resources only when their source and reuse rights are verified. The subject list is a broad starter catalogue, not a verified exhaustive global syllabus directory.

## Deploy to the development branch only
1. Download and extract this ZIP.
2. Open the extracted folder. You should see `server.js`, `package.json`, `public/`, `resources/`, `src-content.js`, and `test/` directly. **Do not upload an outer folder containing these files as a nested folder.**
3. In GitHub, switch to branch `studywise-ai-2` in `crimsonreign25-commits/StudyWise-AI`.
4. Replace the existing project files with the files from this ZIP, keeping the paths at repository root. Do not change the production `main` branch.
5. Commit the changes and wait for Render's development service to finish deploying.
6. Test these URLs:
   - `https://studywise-ai-1.onrender.com/api/curriculum`
   - `https://studywise-ai-1.onrender.com/api/resources`
   Expected `/api/resources` response with an empty index is JSON containing `"resources":[]` and a note that the index is empty. If it still returns `{"error":"API route not found."}`, Render is not serving this `server.js` revision or is configured to start a different app/root directory.

## Configuration
Keep your existing Render environment variables and service settings. The app uses `npm start`; do not expose API keys in client-side files or commit `.env` files.

## Checks
Run `npm test` before deployment. Node.js 20 or newer is required.


## Upgrade 2.1.9 — Revision Library Interface

This upgrade adds a mobile-responsive **Revision library** screen to the app navigation. It reads `/api/resources`, supports searching and filtering by subject/type, shows approved resource metadata, and provides a clear empty state when the resource index has no entries. It also links learners to AI-generated practice through the existing tutor, clearly distinguished from official examination material.

### Upload to GitHub
1. Download and extract this ZIP.
2. Open the extracted project folder and open its contents.
3. Upload/replace the project files at the root of the `studywise-ai-2` branch (do not upload the containing folder as a nested folder).
4. Wait for Render to deploy the new commit, then open the app and select **Revision library**.

### Resource index
Add only verified, rights-cleared entries to `resources/index.json`. Each resource can include `title`, `description`, `subject`, `level`, `curriculum`, `type`, `source`, `year`, and `url`. Do not claim an item is an official KNEC paper unless its source verifies that status. Do not upload protected full text without permission.
