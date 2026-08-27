import { createClient } from 'npm:@supabase/supabase-js@2'
import { reportError } from '../_shared/error-reporter.ts'

// Watchdog for the Composio-managed support-email pipeline (help@magpipe.ai →
// Gmail trigger → composio-trigger-webhook → support_tickets).
//
// Replaces the check_scheduled_staleness alarm dropped on 2026-05-13 when the
// polling cron was retired. It deliberately checks the CONNECTION + TRIGGER
// health on Composio's side — NOT inbound email volume — because "no tickets in
// N hours" is ambiguous (quiet inbox vs. broken pipeline) and would false-page
// overnight. Instead it asserts the things that actually broke on 2026-04-27:
//   1. the Composio API key is valid (list call doesn't 401),
//   2. there's an ACTIVE Gmail connected account,
//   3. a GMAIL_NEW_GMAIL_MESSAGE trigger is enabled AND bound to that ACTIVE
//      account (the silent failure was a live trigger pinned to a REVOKED account).
// Any failure routes through reportError → the SMS/email alert fan-out.
//
// Invoked by pg_cron (service-role bearer). Read-only against Composio.

const COMPOSIO_API_BASE = 'https://backend.composio.dev'

function gmailToolkitSlug(a: Record<string, any>): string {
  const tk = a.toolkit
  return (typeof tk === 'object' && tk ? tk.slug : tk) || ''
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const apiKey = Deno.env.get('COMPOSIO_API_KEY')
  const problems: string[] = []

  try {
    if (!apiKey) {
      problems.push('COMPOSIO_API_KEY is not set')
    } else {
      // 1 + 2: validate key and find an ACTIVE Gmail connected account
      const activeGmailAccountIds = new Set<string>()
      const accRes = await fetch(`${COMPOSIO_API_BASE}/api/v3/connected_accounts`, {
        headers: { 'x-api-key': apiKey },
      })
      if (!accRes.ok) {
        problems.push(`connected_accounts list failed (${accRes.status}): ${(await accRes.text()).slice(0, 200)}`)
      } else {
        const accounts = ((await accRes.json()).items || []) as Record<string, any>[]
        for (const a of accounts) {
          if (gmailToolkitSlug(a) === 'gmail' && a.status === 'ACTIVE') activeGmailAccountIds.add(a.id)
        }
        if (activeGmailAccountIds.size === 0) {
          problems.push('no ACTIVE Composio Gmail connected account (reconnect required)')
        }

        // 3: a GMAIL_NEW_GMAIL_MESSAGE trigger enabled + bound to an ACTIVE account
        const trigRes = await fetch(`${COMPOSIO_API_BASE}/api/v3/trigger_instances/active`, {
          headers: { 'x-api-key': apiKey },
        })
        if (!trigRes.ok) {
          problems.push(`trigger_instances list failed (${trigRes.status})`)
        } else {
          const triggers = ((await trigRes.json()).items || []) as Record<string, any>[]
          const healthy = triggers.find((t) =>
            String(t.trigger_name || '').includes('GMAIL_NEW_GMAIL_MESSAGE') &&
            !t.disabled_at &&
            activeGmailAccountIds.has(t.connected_account_id)
          )
          if (!healthy) {
            problems.push('no enabled GMAIL_NEW_GMAIL_MESSAGE trigger bound to an ACTIVE Gmail account')
          }
        }
      }
    }

    if (problems.length > 0) {
      await reportError(supabase, {
        error_type: 'composio_health_check',
        error_message: `Composio support-email pipeline UNHEALTHY: ${problems.join('; ')}`,
        error_code: 'composio-health-check',
        source: 'composio',
        severity: 'error',
        metadata: { problems },
      })
    }

    return new Response(JSON.stringify({ healthy: problems.length === 0, problems }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    await reportError(supabase, {
      error_type: 'composio_health_check',
      error_message: e instanceof Error ? e.message : String(e),
      error_code: 'composio-health-check:catch',
      source: 'composio',
      severity: 'error',
    })
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
