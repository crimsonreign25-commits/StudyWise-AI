/**
 * Preferred Gemini model plus current fallbacks. Gemini 2.0 Flash has been
 * shut down, so do not retry it. Keep the configured model first so owners
 * can deliberately pin a model supported by their API key/project.
 */
export function geminiModelCandidates(configured = 'gemini-3.8-flash') {
  const preferred = String(configured || '').trim() || 'gemini-3.8-flash';
  return [...new Set([preferred, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'])];
}
