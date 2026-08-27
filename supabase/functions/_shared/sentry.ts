/**
 * Sentry error monitoring for Supabase edge functions (Deno).
 *
 * Additive to the log-error → system_error_logs → SMS/Slack paging pipeline.
 * No-op when SENTRY_DSN is unset — and because the SDK is loaded via DYNAMIC
 * import only when the DSN is present, the ~237 functions that import
 * error-reporter never even fetch the Sentry module until the secret is set.
 * Reporting must never throw into the caller's path.
 *
 * Set the secret with:  supabase secrets set SENTRY_DSN=...
 * (then redeploy functions so they pick up this shared module)
 */

const DSN = Deno.env.get('SENTRY_DSN')

// Lazily import + init the SDK once, only if a DSN is configured.
let sentryPromise: Promise<any> | null = null
function getSentry(): Promise<any> | null {
  if (!DSN) return null
  if (!sentryPromise) {
    sentryPromise = (async () => {
      try {
        const Sentry = await import('npm:@sentry/deno@10.64.0')
        Sentry.init({
          dsn: DSN,
          environment: 'production',
          sendDefaultPii: false,
          tracesSampleRate: 0,
        })
        return Sentry
      } catch (e) {
        console.error('[sentry] init failed:', e)
        return null
      }
    })()
  }
  return sentryPromise
}

export interface EdgeErrorReport {
  error_type: string
  error_message: string
  error_code?: string
  source?: string
  severity?: 'error' | 'warning'
  metadata?: Record<string, unknown>
  user_id?: string
}

/**
 * Capture a structured edge error into Sentry. Mirrors ErrorReport so the same
 * fields become Sentry tags + context. Safe to call (and await) unconditionally.
 */
export async function captureEdgeError(report: EdgeErrorReport): Promise<void> {
  try {
    const p = getSentry()
    if (!p) return
    const Sentry = await p
    if (!Sentry) return
    Sentry.withScope((scope: any) => {
      scope.setLevel(report.severity === 'warning' ? 'warning' : 'error')
      scope.setTag('error_type', report.error_type)
      scope.setTag('source', report.source || 'supabase')
      if (report.error_code) scope.setTag('error_code', report.error_code)
      if (report.user_id) scope.setUser({ id: report.user_id })
      if (report.metadata) scope.setContext('metadata', report.metadata)
      Sentry.captureException(new Error(`[${report.error_type}] ${report.error_message}`))
    })
  } catch (e) {
    console.error('[sentry] capture failed:', e)
  }
}

/**
 * Wrap a Deno.serve handler so anything that escapes its own try/catch is
 * captured before the runtime turns it into a 500. Opt-in per function:
 *   Deno.serve(withSentry(async (req) => { ... }, 'my-function'))
 */
export function withSentry(
  handler: (req: Request) => Promise<Response> | Response,
  functionName: string,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req)
    } catch (err) {
      await captureEdgeError({
        error_type: 'edge_uncaught',
        error_message: err instanceof Error ? err.message : String(err),
        source: functionName,
        metadata: { stack: err instanceof Error ? err.stack : undefined },
      })
      throw err
    }
  }
}
