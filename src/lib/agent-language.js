/**
 * Agent language defaults — single source of truth.
 *
 * New agents default to English ('en-US'), which selects the faster English
 * turn-detector model (EnglishModel) in the voice agent. Multilingual is an
 * explicit opt-in. Keeping the default here (rather than relying on the
 * agent_configs.language DB column default) means a future migration can't
 * silently flip new agents to multilingual, and we never persist a null/empty
 * language that downstream code has to guess about.
 */
export const DEFAULT_AGENT_LANGUAGE = 'en-US';

/**
 * Resolve the language to persist for a (new) agent.
 * Falsy input (undefined/null/'') → English default; an explicit value
 * ('multi', 'fr', 'es', 'de', ...) is preserved.
 * @param {string|null|undefined} input
 * @returns {string}
 */
export function resolveAgentLanguage(input) {
  return input || DEFAULT_AGENT_LANGUAGE;
}
