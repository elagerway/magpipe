/**
 * Human-readable language names + translation "bridge" descriptions.
 * Edge (Deno) counterpart of src/lib/languages.js — keep the two in sync.
 *
 * Accepts ISO-639-1 codes ('zh','fr') and locale variants ('en-US','zh-CN');
 * falls back to the raw code when unknown.
 */
const LANGUAGE_NAMES: Record<string, string> = {
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
export function normalizeLanguageCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return String(code).toLowerCase().split(/[-_]/)[0];
}

/** Human-readable name for a language/locale code; falls back to the code. */
export function languageName(code: string | null | undefined): string | null {
  const base = normalizeLanguageCode(code);
  if (!base) return null;
  return LANGUAGE_NAMES[base] || base.toUpperCase();
}

/**
 * Describe a translation bridge, e.g. "Mandarin → English".
 * Returns null when no real cross-language bridge exists (missing/equal codes).
 */
export function describeBridge(
  sourceCode: string | null | undefined,
  targetCode: string | null | undefined,
): string | null {
  const src = normalizeLanguageCode(sourceCode);
  const tgt = normalizeLanguageCode(targetCode);
  if (!src || !tgt || src === tgt) return null;
  return `${languageName(src)} → ${languageName(tgt)}`;
}
