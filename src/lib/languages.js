/**
 * Human-readable language names + translation "bridge" descriptions.
 *
 * Keep this list small and aligned with what the translation flow actually
 * detects/produces. Accepts ISO-639-1 codes ('zh','fr') and a few locale
 * variants ('en-US','zh-CN'); falls back to the raw code when unknown.
 */
const LANGUAGE_NAMES = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  zh: 'Mandarin',
  yue: 'Cantonese',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  pa: 'Punjabi',
  vi: 'Vietnamese',
  tl: 'Tagalog',
  fa: 'Persian',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
  tr: 'Turkish',
  he: 'Hebrew',
  th: 'Thai',
};

/** Normalize a language/locale code to its base ISO-639-1 code, lowercased. */
export function normalizeLanguageCode(code) {
  if (!code) return null;
  return String(code).toLowerCase().split(/[-_]/)[0];
}

/** Human-readable name for a language/locale code; falls back to the code. */
export function languageName(code) {
  const base = normalizeLanguageCode(code);
  if (!base) return null;
  return LANGUAGE_NAMES[base] || base.toUpperCase();
}

/**
 * Describe a translation bridge, e.g. "Mandarin → English".
 * Returns null when no real cross-language bridge exists (missing/equal codes).
 */
export function describeBridge(sourceCode, targetCode) {
  const src = normalizeLanguageCode(sourceCode);
  const tgt = normalizeLanguageCode(targetCode);
  if (!src || !tgt || src === tgt) return null;
  return `${languageName(src)} → ${languageName(tgt)}`;
}
