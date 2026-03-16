/**
 * Shared utility for reporting caught errors to the error monitoring system.
 * Use this in catch blocks that swallow exceptions (try/catch with toast) so
 * errors still appear in admin/support/errors even if they don't bubble up.
 *
 * Usage:
 *   import { reportError } from '../../lib/error-reporter.js'
 *   catch (err) {
 *     reportError('frontend_js_error', err)
 *     showToast('Something went wrong', 'error')
 *   }
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * @param {string} errorType - e.g. 'frontend_js_error'
 * @param {Error|string} error - the caught error or message string
 * @param {string} [code] - optional location hint, e.g. 'skills-tab:save'
 */
export function reportError(errorType, error, code = '') {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? (error.stack || '').substring(0, 500) : ''
  fetch(`${SUPABASE_URL}/functions/v1/log-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({
      error_type: errorType,
      error_message: message.substring(0, 500),
      error_code: code,
      source: 'vercel',
      severity: 'error',
      metadata: { url: window.location.pathname, stack },
    }),
  }).catch(() => {}) // fire-and-forget
}
