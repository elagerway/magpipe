/**
 * App Function Preferences — shared helper for per-app notification controls.
 *
 * Preferences live inside agent_configs.functions JSONB under "app_functions":
 * {
 *   "app_functions": {
 *     "slack":   { "enabled": true, "sms": true, "calls": true, "web_chat": true, "translations": true },
 *     "hubspot": { "enabled": true, "sms": true, "calls": true, "web_chat": true }
 *   }
 * }
 *
 * When the key is missing the default is ON (backwards-compatible).
 */

export interface AppFunctionPrefs {
  enabled: boolean
  sms: boolean
  calls: boolean
  web_chat: boolean
  translations: boolean
}

const DEFAULTS: AppFunctionPrefs = {
  enabled: true,
  sms: true,
  calls: true,
  web_chat: true,
  translations: true,
}

/**
 * Read per-app prefs from the functions JSONB.
 * Returns defaults (everything ON) when no prefs exist.
 */
export function getAppPrefs(
  functions: Record<string, any> | null | undefined,
  app: string
): AppFunctionPrefs {
  if (!functions?.app_functions?.[app]) return { ...DEFAULTS }
  return { ...DEFAULTS, ...functions.app_functions[app] }
}

/**
 * Quick check: should we send a notification to `app` for the given `channel`?
 */
export function shouldNotify(
  functions: Record<string, any> | null | undefined,
  app: string,
  channel: 'sms' | 'calls' | 'web_chat'
): boolean {
  const prefs = getAppPrefs(functions, app)
  return prefs.enabled && prefs[channel]
}

/**
 * Filter extracted data for a specific app, respecting per-variable send_to
 * overrides and the global extract_data.send_to default.
 *
 * @param extractedData   The flat key→value extracted data from call_records
 * @param dynamicVars     The dynamic_variables rows (must include name, send_to)
 * @param functions       The agent_configs.functions JSONB
 * @param app             The target app slug (e.g. 'slack')
 * @returns               Filtered extracted data, or null if nothing to send
 */
export function filterExtractedDataForApp(
  extractedData: Record<string, any> | null | undefined,
  dynamicVars: Array<{ name: string; send_to?: Record<string, boolean> | null }>,
  functions: Record<string, any> | null | undefined,
  app: string
): Record<string, any> | null {
  if (!extractedData || Object.keys(extractedData).length === 0) return null

  const globalSendTo = functions?.extract_data?.send_to?.[app] !== false // default ON

  const filtered: Record<string, any> = {}
  for (const [key, value] of Object.entries(extractedData)) {
    // Find the matching variable definition
    const varDef = dynamicVars.find(v => v.name === key)

    // Per-variable override takes precedence, then global default
    let shouldSend: boolean
    if (varDef?.send_to && varDef.send_to[app] !== undefined) {
      shouldSend = varDef.send_to[app]
    } else {
      shouldSend = globalSendTo
    }

    if (shouldSend) {
      filtered[key] = value
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : null
}
