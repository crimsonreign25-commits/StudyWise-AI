/** Returns preferred Gemini model followed by safe current fallbacks, without duplicates. */
export function geminiModelCandidates(configured = 'gemini-2.5-flash') {
  return [...new Set([String(configured || '').trim() || 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'])];
}
