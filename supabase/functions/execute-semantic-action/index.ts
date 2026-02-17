import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://magpipe.ai'

interface CallDetail {
  contact_name: string
  contact_phone: string
  sentiment: string
  summary: string
  transcript: string
  recording_url: string
  started_at: string
  duration_seconds: number
  inbox_url: string
}

Deno.serve(async (req) => {
  try {
    const { agent_id, user_id, matched_topics, match_count, triggering_summary, agent_name, matched_memory_ids } = await req.json()

    if (!agent_id || !user_id || !matched_topics) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch active semantic match actions for this agent
    const { data: actions, error: actionsError } = await supabase
      .from('semantic_match_actions')
      .select('*')
      .eq('agent_id', agent_id)
      .eq('is_active', true)

    if (actionsError) {
      console.error('Error fetching actions:', actionsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch actions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!actions || actions.length === 0) {
      return new Response(JSON.stringify({ message: 'No active actions', triggered: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Fetch call details from matched memories (do this once for all actions)
    const callDetails = await fetchCallDetails(supabase, matched_memory_ids || [])

    const now = new Date()
    const results: { actionId: string; name: string; fired: boolean; reason?: string }[] = []
    const matchedTopicsLower = (matched_topics as string[]).map(t => t.toLowerCase())

    for (const action of actions) {
      // Check topic overlap (case-insensitive substring match)
      const monitoredTopics = (action.monitored_topics || []) as string[]
      const hasTopicMatch = monitoredTopics.length === 0 || monitoredTopics.some(monitored =>
        matchedTopicsLower.some(matched => matched.includes(monitored.toLowerCase()) || monitored.toLowerCase().includes(matched))
      )

      if (!hasTopicMatch) {
        results.push({ actionId: action.id, name: action.name, fired: false, reason: 'no topic match' })
        continue
      }

      // Check threshold
      if (match_count < action.match_threshold) {
        results.push({ actionId: action.id, name: action.name, fired: false, reason: `below threshold (${match_count}/${action.match_threshold})` })
        continue
      }

      // Check cooldown
      if (action.last_triggered_at) {
        const lastTriggered = new Date(action.last_triggered_at)
        const cooldownMs = (action.cooldown_minutes || 60) * 60 * 1000
        if (now.getTime() - lastTriggered.getTime() < cooldownMs) {
          results.push({ actionId: action.id, name: action.name, fired: false, reason: 'cooldown active' })
          continue
        }
      }

      // Build shared alert data
      const topicsStr = matched_topics.slice(0, 5).join(', ')
      const alertData = {
        actionName: action.name,
        agentName: agent_name || 'Unknown',
        topics: topicsStr,
        matchCount: match_count,
        summary: (triggering_summary || '').slice(0, 300),
        callDetails,
        sentiment: callDetails.length > 0 ? summarizeSentiment(callDetails) : 'Unknown'
      }

      let fired = false
      try {
        switch (action.action_type) {
          case 'sms':
            fired = await fireSms(action.action_config, alertData, user_id, agent_id, supabase)
            break
          case 'email':
            fired = await fireEmail(action.action_config, alertData)
            break
          case 'slack':
            fired = await fireSlack(action.action_config, alertData, user_id, supabase)
            break
          case 'hubspot':
            fired = await fireHubSpot(action.action_config, formatPlainAlert(alertData), user_id, supabase)
            break
          case 'webhook':
            fired = await fireWebhook(action.action_config, {
              ...alertData,
              matched_topics,
              match_count,
              triggering_summary,
              timestamp: now.toISOString()
            })
            break
        }
      } catch (err) {
        console.error(`Error firing action ${action.name}:`, err)
      }

      if (fired) {
        await supabase
          .from('semantic_match_actions')
          .update({
            last_triggered_at: now.toISOString(),
            trigger_count: (action.trigger_count || 0) + 1
          })
          .eq('id', action.id)
      }

      results.push({ actionId: action.id, name: action.name, fired })
    }

    const triggeredCount = results.filter(r => r.fired).length
    console.log(`Semantic actions: ${triggeredCount}/${results.length} fired`, results)

    return new Response(JSON.stringify({ success: true, triggered: triggeredCount, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in execute-semantic-action:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

// --- Data enrichment ---

async function fetchCallDetails(supabase: any, memoryIds: string[]): Promise<CallDetail[]> {
  if (!memoryIds || memoryIds.length === 0) return []

  try {
    // Get conversation_contexts with their last_call_ids and contact info
    const { data: contexts } = await supabase
      .from('conversation_contexts')
      .select('id, contact_id, contact_phone, last_call_ids')
      .in('id', memoryIds)

    if (!contexts || contexts.length === 0) return []

    // Collect all call IDs
    const allCallIds: string[] = []
    for (const ctx of contexts) {
      if (ctx.last_call_ids && Array.isArray(ctx.last_call_ids)) {
        // Take the most recent call per context (last in array)
        allCallIds.push(ctx.last_call_ids[ctx.last_call_ids.length - 1])
      }
    }

    if (allCallIds.length === 0) return []

    // Fetch call records with details
    const { data: calls } = await supabase
      .from('call_records')
      .select('id, contact_id, caller_number, user_sentiment, call_summary, transcript, recording_url, started_at, duration_seconds')
      .in('id', allCallIds)
      .order('started_at', { ascending: false })

    if (!calls || calls.length === 0) return []

    // Get contact names
    const contactIds = [...new Set(calls.map((c: any) => c.contact_id).filter(Boolean))]
    let contactMap: Record<string, string> = {}
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, phone_number')
        .in('id', contactIds)
      if (contacts) {
        contactMap = Object.fromEntries(contacts.map((c: any) => [c.id, c.name || c.phone_number || 'Unknown']))
      }
    }

    return calls.map((call: any) => ({
      contact_name: contactMap[call.contact_id] || call.caller_number || 'Unknown',
      contact_phone: call.caller_number || '',
      sentiment: call.user_sentiment || 'neutral',
      summary: call.call_summary || '',
      transcript: call.transcript || '',
      recording_url: call.recording_url || '',
      started_at: call.started_at || '',
      duration_seconds: call.duration_seconds || 0,
      inbox_url: call.id ? `${APP_URL}/inbox?call=${call.id}` : ''
    }))
  } catch (err) {
    console.error('Error fetching call details:', err)
    return []
  }
}

function summarizeSentiment(calls: CallDetail[]): string {
  const sentiments = calls.map(c => c.sentiment).filter(Boolean)
  if (sentiments.length === 0) return 'Unknown'
  const counts: Record<string, number> = {}
  for (const s of sentiments) {
    const key = s.toLowerCase()
    counts[key] = (counts[key] || 0) + 1
  }
  // Return most common sentiment
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

const sentimentEmoji: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😠',
  frustrated: '😤',
  angry: '🔴',
  happy: '😃',
  confused: '😕',
  satisfied: '✅'
}

function getSentimentEmoji(sentiment: string): string {
  return sentimentEmoji[sentiment.toLowerCase()] || '❓'
}

function formatPlainAlert(data: any): string {
  const lines = [
    `Semantic Alert: ${data.actionName}`,
    `Agent: ${data.agentName}`,
    `Sentiment: ${getSentimentEmoji(data.sentiment)} ${data.sentiment}`,
    `Topics: ${data.topics}`,
    `Pattern matches: ${data.matchCount}`,
    `Triggering summary: ${data.summary}`,
  ]
  if (data.callDetails && data.callDetails.length > 0) {
    lines.push('', '--- Related Conversations ---')
    for (const call of data.callDetails) {
      lines.push(`• ${call.contact_name} (${call.contact_phone}) — ${getSentimentEmoji(call.sentiment)} ${call.sentiment}`)
      if (call.summary) lines.push(`  Summary: ${call.summary.slice(0, 150)}`)
      if (call.inbox_url) lines.push(`  Inbox: ${call.inbox_url}`)
    }
  }
  return lines.join('\n')
}

// --- Action handlers ---

async function fireSms(config: any, data: any, userId: string, agentId: string, supabase: any): Promise<boolean> {
  const phone = config.phone_number
  if (!phone) {
    console.error('SMS action missing phone_number')
    return false
  }

  const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
  const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
  const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

  // +16042101966 is voice-only — never use for outbound SMS
  let fromNumber: string | null = null
  const { data: agentNumber } = await supabase
    .from('service_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .neq('phone_number', '+16042101966')
    .limit(1)
    .single()

  if (agentNumber) {
    fromNumber = agentNumber.phone_number
  } else {
    const { data: fallback } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('phone_number', '+16042101966')
      .limit(1)
      .single()
    if (fallback) fromNumber = fallback.phone_number
  }

  if (!fromNumber) {
    console.error('No SMS-capable service number found')
    return false
  }

  // SMS: compact format (160 char segments)
  const lines = [
    `🔔 Semantic Alert: ${data.actionName}`,
    `${getSentimentEmoji(data.sentiment)} Sentiment: ${data.sentiment}`,
    `🏷️ Topics: ${data.topics}`,
    `📊 ${data.matchCount} pattern matches`,
    `💬 ${data.summary.slice(0, 100)}`,
  ]
  if (data.callDetails?.[0]?.inbox_url) {
    lines.push(`📥 ${data.callDetails[0].inbox_url}`)
  }
  const message = lines.join('\n')

  const smsData = new URLSearchParams({ From: fromNumber, To: phone, Body: message })
  const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
  const resp = await fetch(
    `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
    {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: smsData.toString(),
    }
  )

  if (!resp.ok) {
    const errText = await resp.text()
    console.error('SMS alert send error:', errText)
    return false
  }

  console.log('SMS alert sent to', phone)
  return true
}

async function fireEmail(config: any, data: any): Promise<boolean> {
  const email = config.email_address
  if (!email) {
    console.error('Email action missing email_address')
    return false
  }

  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
  const subject = config.subject_template || `${getSentimentEmoji(data.sentiment)} Semantic Alert: ${data.actionName} — ${data.agentName}`

  // Build rich HTML email
  const callRows = (data.callDetails || []).map((call: CallDetail) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px; vertical-align: top;">
        <strong>${escHtml(call.contact_name)}</strong><br/>
        <span style="color: #666; font-size: 0.85rem;">${escHtml(call.contact_phone)}</span>
      </td>
      <td style="padding: 10px; vertical-align: top;">
        ${getSentimentEmoji(call.sentiment)} ${escHtml(call.sentiment)}
      </td>
      <td style="padding: 10px; vertical-align: top; font-size: 0.85rem;">
        ${escHtml(call.summary ? call.summary.slice(0, 200) : 'No summary')}
      </td>
      <td style="padding: 10px; vertical-align: top; white-space: nowrap;">
        ${call.inbox_url ? `<a href="${call.inbox_url}" style="color: #2563eb;">View in Inbox</a>` : ''}
        ${call.recording_url ? `<br/><a href="${call.recording_url}" style="color: #2563eb;">Recording</a>` : ''}
      </td>
    </tr>
  `).join('')

  const transcriptSections = (data.callDetails || [])
    .filter((c: CallDetail) => c.transcript)
    .map((call: CallDetail) => `
      <div style="margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.5rem; color: #374151;">${escHtml(call.contact_name)} — ${new Date(call.started_at).toLocaleString()}</h4>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; font-size: 0.8rem; line-height: 1.6; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
${escHtml(call.transcript)}
        </div>
      </div>
    `).join('')

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 8px 8px 0;">
        <h2 style="margin: 0 0 0.25rem; color: #92400e;">🔔 Semantic Alert: ${escHtml(data.actionName)}</h2>
        <p style="margin: 0; color: #a16207;">Recurring pattern detected across ${data.matchCount} conversations</p>
      </div>

      <table style="width: 100%; margin-bottom: 1.5rem;">
        <tr>
          <td style="padding: 0.25rem 0;"><strong>🤖 Agent:</strong></td>
          <td>${escHtml(data.agentName)}</td>
        </tr>
        <tr>
          <td style="padding: 0.25rem 0;"><strong>${getSentimentEmoji(data.sentiment)} Sentiment:</strong></td>
          <td>${escHtml(data.sentiment)}</td>
        </tr>
        <tr>
          <td style="padding: 0.25rem 0;"><strong>🏷️ Topics:</strong></td>
          <td>${escHtml(data.topics)}</td>
        </tr>
        <tr>
          <td style="padding: 0.25rem 0;"><strong>💬 Trigger:</strong></td>
          <td>${escHtml(data.summary)}</td>
        </tr>
      </table>

      ${(data.callDetails || []).length > 0 ? `
        <h3 style="margin: 0 0 0.75rem; color: #374151;">📞 Related Conversations</h3>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 1.5rem;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px 10px; text-align: left; font-size: 0.8rem;">Contact</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 0.8rem;">Sentiment</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 0.8rem;">Summary</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 0.8rem;">Links</th>
            </tr>
          </thead>
          <tbody>
            ${callRows}
          </tbody>
        </table>
      ` : ''}

      ${transcriptSections ? `
        <h3 style="margin: 0 0 0.75rem; color: #374151;">📝 Full Transcripts</h3>
        ${transcriptSections}
      ` : ''}

      <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 0.75rem;">
        This alert was triggered by a semantic pattern match in your agent's conversations.
      </p>
    </div>
  `

  const textBody = formatPlainAlert(data)

  const resp = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey
    },
    body: JSON.stringify({
      From: Deno.env.get('NOTIFICATION_EMAIL') || 'notifications@snapsonic.com',
      To: email,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: 'outbound'
    })
  })

  if (!resp.ok) {
    const errResult = await resp.json()
    console.error('Email alert error:', errResult)
    return false
  }

  console.log('Email alert sent to', email)
  return true
}

async function fireSlack(config: any, data: any, userId: string, supabase: any): Promise<boolean> {
  const channelName = config.channel_name
  if (!channelName) {
    console.error('Slack action missing channel_name')
    return false
  }

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('user_id', userId)
    .eq('integration_providers.slug', 'slack')
    .eq('status', 'connected')
    .single()

  if (!integration?.access_token) {
    console.error('No Slack integration found for user')
    return false
  }

  let channelId = channelName
  if (channelName.startsWith('#') || !channelName.startsWith('C')) {
    const name = channelName.replace(/^#/, '').toLowerCase()
    const listResp = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
      headers: { 'Authorization': `Bearer ${integration.access_token}` }
    })
    const listResult = await listResp.json()
    if (listResult.ok && listResult.channels) {
      const found = listResult.channels.find((c: any) => c.name.toLowerCase() === name)
      if (found) channelId = found.id
      else {
        console.error(`Slack channel "${channelName}" not found`)
        return false
      }
    }
  }

  await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${integration.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `channel=${encodeURIComponent(channelId)}`,
  })

  // Build Slack message with call details
  const lines = [
    `🔔 *Semantic Alert: ${data.actionName}*`,
    `🤖 *Agent:* ${data.agentName}`,
    `${getSentimentEmoji(data.sentiment)} *Sentiment:* ${data.sentiment}`,
    `🏷️ *Topics:* ${data.topics}`,
    `📊 *Pattern matches:* ${data.matchCount}`,
    `💬 *Trigger:* ${data.summary}`,
  ]

  if (data.callDetails && data.callDetails.length > 0) {
    lines.push('', '📞 *Related Conversations:*')
    for (const call of data.callDetails) {
      const parts = [`• *${call.contact_name}* (${call.contact_phone}) — ${getSentimentEmoji(call.sentiment)} ${call.sentiment}`]
      if (call.summary) parts.push(`  _${call.summary.slice(0, 120)}_`)
      if (call.inbox_url) parts.push(`  <${call.inbox_url}|View in Inbox>`)
      if (call.recording_url) parts.push(`  <${call.recording_url}|🎙️ Recording>`)
      lines.push(parts.join('\n'))
    }
  }

  const slackText = lines.join('\n')

  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${integration.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text: slackText }),
  })

  const result = await resp.json()
  if (!result.ok) {
    console.error('Slack alert error:', result.error)
    return false
  }

  console.log('Slack alert sent to', channelName)
  return true
}

async function fireHubSpot(config: any, message: string, userId: string, supabase: any): Promise<boolean> {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('user_id', userId)
    .eq('integration_providers.slug', 'hubspot')
    .eq('status', 'connected')
    .single()

  if (!integration?.access_token) {
    console.error('No HubSpot integration found for user')
    return false
  }

  const contactEmail = config.contact_email
  if (contactEmail) {
    const searchResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${integration.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: contactEmail }] }],
        properties: ['firstname', 'lastname', 'email']
      })
    })
    const searchResult = await searchResp.json()
    const contact = searchResult.results?.[0]

    if (contact) {
      const noteResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${integration.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { hs_note_body: message, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: contact.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
        })
      })
      if (!noteResp.ok) {
        console.error('HubSpot note error:', await noteResp.json())
        return false
      }
      console.log('HubSpot note created for', contactEmail)
      return true
    }
  }

  const noteResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${integration.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { hs_note_body: message, hs_timestamp: new Date().toISOString() } })
  })
  if (!noteResp.ok) {
    console.error('HubSpot note error:', await noteResp.json())
    return false
  }
  console.log('HubSpot standalone note created')
  return true
}

async function fireWebhook(config: any, payload: any): Promise<boolean> {
  const url = config.url
  if (!url) {
    console.error('Webhook action missing url')
    return false
  }

  const resp = await fetch(url, {
    method: config.method || 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
    body: JSON.stringify(payload)
  })

  if (!resp.ok) {
    console.error(`Webhook ${url} returned ${resp.status}`)
    return false
  }

  console.log('Webhook alert sent to', url)
  return true
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
