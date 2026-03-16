/**
 * test-call-status — StatusCallback from SignalWire for inbound test calls.
 * Triggered when the test caller leg ends. Fires test-log-collector on terminal status.
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const runId = url.searchParams.get('run_id')

    // Parse SignalWire form data
    let callStatus = ''
    try {
      const formData = await req.formData()
      callStatus = (formData.get('CallStatus') as string) || ''
    } catch {
      // query param fallback
      callStatus = url.searchParams.get('CallStatus') || ''
    }

    console.log(`test-call-status: run=${runId} status=${callStatus}`)

    const terminalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled']
    if (runId && terminalStatuses.includes(callStatus)) {
      const collectPromise = fetch(`${SUPABASE_URL}/functions/v1/test-log-collector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ test_run_id: runId }),
      }).catch(err => console.error('Failed to trigger test-log-collector:', err))
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil(collectPromise)
    }

    return new Response('ok', { status: 200 })
  } catch (e: any) {
    console.error('test-call-status error:', e)
    return new Response('ok', { status: 200 })
  }
})
