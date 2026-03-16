/**
 * Review Request Campaign Skill Handler
 * Sends individual review request SMS to recent callers via send-notification-sms.
 * Respects minimum days between requests per contact.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'
import { resolveTemplate } from './template.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, isDryRun, supabaseClient, agentSkill, userId } = context
    const supabase = supabaseClient as ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>

    const messageTemplate = (config.message_template as string) || 'Hi {{caller_name}}, please leave us a review: {{review_url}}'
    const reviewUrl = (config.review_url as string) || ''
    const minDays = (config.min_days_since_last_request as number) || 30
    const consentConfirmed = config.consent_confirmed as boolean
    const organizationName = (config.organization_name as string) || ''

    if (!reviewUrl) {
      return {
        summary: 'No review URL configured.',
        actions_taken: ['skipped_no_url'],
      }
    }

    if (!consentConfirmed && !isDryRun) {
      return {
        summary: 'Consent not confirmed. Review requests not sent.',
        actions_taken: ['skipped_no_consent'],
      }
    }

    // Get recent callers from call_records for this agent (last 7 days)
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentCalls } = await supabase
      .from('call_records')
      .select('caller_number, extracted_data')
      .eq('user_id', userId)
      .eq('agent_id', agentSkill.agent_id)
      .eq('direction', 'inbound')
      .gte('created_at', cutoffDate)
      .not('caller_number', 'is', null)

    if (!recentCalls || recentCalls.length === 0) {
      return {
        summary: 'No recent callers found to send review requests to.',
        actions_taken: ['no_contacts'],
      }
    }

    // Deduplicate by phone number, prefer calls with caller_name in extracted_data
    const uniqueCallers = new Map<string, string>()
    for (const call of recentCalls) {
      if (!call.caller_number) continue
      const name = (call.extracted_data as Record<string, unknown>)?.caller_name as string || ''
      if (!uniqueCallers.has(call.caller_number) || (name && !uniqueCallers.get(call.caller_number))) {
        uniqueCallers.set(call.caller_number, name)
      }
    }

    // Check which contacts already received a review request recently
    const minDaysAgo = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentRequests } = await supabase
      .from('skill_executions')
      .select('result')
      .eq('agent_skill_id', agentSkill.id)
      .eq('status', 'completed')
      .gte('created_at', minDaysAgo)

    const recentlyContacted = new Set<string>()
    for (const exec of recentRequests || []) {
      const resultData = (exec.result as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      const contacts = (resultData?.contacted_phones as string[]) || []
      for (const phone of contacts) {
        recentlyContacted.add(phone)
      }
    }

    // Filter out recently contacted
    const eligibleCallers: Array<{ phone: string; name: string }> = []
    for (const [phone, name] of uniqueCallers) {
      if (!recentlyContacted.has(phone)) {
        eligibleCallers.push({ phone, name })
      }
    }

    if (eligibleCallers.length === 0) {
      return {
        summary: 'All recent callers have already received a review request within the configured window.',
        actions_taken: ['all_contacted_recently'],
      }
    }

    // Prepare messages
    const messages = eligibleCallers.map(caller => {
      const variables: Record<string, string> = {
        caller_name: caller.name || 'there',
        caller_phone: caller.phone,
        review_url: reviewUrl,
        organization_name: organizationName,
      }
      return {
        phone: caller.phone,
        name: caller.name,
        message: resolveTemplate(messageTemplate, variables),
      }
    })

    if (isDryRun) {
      return {
        summary: `${messages.length} review request(s) would be sent`,
        actions_taken: ['preview'],
        preview: messages.map(m => `To: ${m.name || m.phone} — "${m.message}"`).join('\n\n'),
        data: { eligible_count: messages.length, messages },
      }
    }

    // Send individual SMS to each eligible caller via send-notification-sms
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sent: string[] = []
    const failed: string[] = []

    for (const msg of messages) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            agentId: agentSkill.agent_id,
            type: 'skill_execution',
            data: {
              message: msg.message,
              recipientPhone: msg.phone,
            },
          }),
        })
        if (resp.ok) {
          const result = await resp.json()
          if (result.success) {
            sent.push(msg.phone)
          } else {
            // 200 but skipped (opted out, etc.)
            console.log(`SMS skipped for ${msg.phone}: ${result.message || 'unknown'}`)
            failed.push(msg.phone)
          }
        } else {
          const errText = await resp.text()
          console.error(`SMS failed for ${msg.phone}: ${errText}`)
          failed.push(msg.phone)
        }
      } catch (err) {
        console.error(`SMS error for ${msg.phone}:`, err)
        failed.push(msg.phone)
      }
    }

    return {
      summary: `Review Request: ${sent.length} sent, ${failed.length} failed out of ${messages.length} eligible`,
      actions_taken: sent.length > 0 ? ['requests_sent'] : ['all_failed'],
      data: {
        contacted_phones: sent,
        failed_phones: failed,
        eligible_count: messages.length,
        sent_count: sent.length,
        failed_count: failed.length,
      },
    }
  }
}

export default handler
