/**
 * Shared error reporter — logs to system_error_logs using an existing service-role supabase client.
 * Lightweight: just a DB insert, no HTTP round-trip. Use this inside edge functions.
 * For frontend errors, call the log-error edge function directly.
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

export async function reportError(supabase: any, report: ErrorReport): Promise<void> {
  try {
    const { error } = await supabase.from('system_error_logs').insert({
      error_type: report.error_type,
      error_message: String(report.error_message).substring(0, 2000),
      error_code: report.error_code ? String(report.error_code).substring(0, 100) : null,
      source: report.source || 'supabase',
      severity: report.severity || 'error',
      metadata: report.metadata || {},
      user_id: report.user_id || null,
    })
    if (error) console.error('[error-reporter] Insert failed:', error)
  } catch (e) {
    console.error('[error-reporter] Unexpected error:', e)
  }
}
