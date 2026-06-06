/**
 * Shared error reporter — routes errors through the log-error edge function
 * so the alert fan-out (SMS / email / Slack) and 15-min throttle apply
 * regardless of which subsystem reported the error. Direct DB inserts skip
 * the alert path, which is why we made this an HTTP call.
 *
 * Callers still pass a service-role supabase client (kept for API compat),
 * but it's only used to look up SUPABASE_URL via env. We don't insert from
 * here — log-error handles the insert.
 *
 * Failure mode is silent: if log-error itself is down or unreachable we log
 * to console and move on rather than throwing. Reporting an error must never
 * itself become a new error in the call path.
 */

export interface ErrorReport {
  error_type: string
  error_message: string
  error_code?: string
  source?: string
  severity?: 'error' | 'warning'
  metadata?: Record<string, unknown>
  user_id?: string
}

export async function reportError(_supabase: any, report: ErrorReport): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.error('[error-reporter] Missing SUPABASE_URL or SERVICE_ROLE_KEY env')
      return
    }
    const resp = await fetch(`${supabaseUrl}/functions/v1/log-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        error_type: report.error_type,
        error_message: String(report.error_message).substring(0, 2000),
        error_code: report.error_code ? String(report.error_code).substring(0, 100) : undefined,
        source: report.source || 'supabase',
        severity: report.severity || 'error',
        metadata: report.metadata || {},
        user_id: report.user_id,
      }),
    })
    if (!resp.ok) {
      console.error('[error-reporter] log-error returned', resp.status, await resp.text())
    }
  } catch (e) {
    console.error('[error-reporter] Unexpected error:', e)
  }
}
