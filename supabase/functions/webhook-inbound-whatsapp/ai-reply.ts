/**
 * WhatsApp AI Reply Logic
 * Similar to SMS ai-reply.ts but sends via Meta's WhatsApp API
 */

import { getContactMemory, searchSimilarMemories, updateContactMemory } from '../webhook-inbound-sms/memory.ts'
import { searchKnowledgeBase } from '../webhook-inbound-sms/knowledge.ts'
import { isWithinSchedule } from '../webhook-inbound-sms/notifications.ts'

export async function processAndReplyWhatsApp(
  userId: string,
  from: string,      // customer's WhatsApp number
  phoneNumberId: string, // our Meta phone_number_id
  body: string,
  supabase: any,
  agentConfig: any,
  accessToken: string,
  sessionId: string | null = null
) {
  try {
    // Check if AI is paused for this conversation
    const { data: context } = await supabase
      .from('conversation_contexts')
      .select('ai_paused_until')
      .eq('user_id', userId)
      .eq('contact_phone', from)
      .eq('service_number', phoneNumberId)
      .single()

    if (context?.ai_paused_until) {
      const pausedUntil = new Date(context.ai_paused_until)
      if (pausedUntil > new Date()) {
        console.log(`WhatsApp AI paused until ${pausedUntil.toISOString()}`)
        return
      }
    }

    // Check schedule
    if (agentConfig.texts_schedule) {
      const inSchedule = isWithinSchedule(agentConfig.texts_schedule, agentConfig.schedule_timezone)
      if (!inSchedule) {
        console.log('WhatsApp message outside scheduled hours for agent:', agentConfig.id)
        await sendWhatsAppMessage(phoneNumberId, from, 'This agent is currently off duty.', accessToken)
        return
      }
    }

    // Get conversation history
    const { data: recentMessages } = await supabase
      .from('sms_messages')
      .select('content, direction, sent_at')
      .eq('user_id', userId)
      .eq('channel', 'whatsapp')
      .or(`sender_number.eq.${from},recipient_number.eq.${from}`)
      .order('sent_at', { ascending: false })
      .limit(6)

    const conversationHistory = recentMessages
      ?.filter((m: any) => m.content !== body)
      ?.reverse()
      ?.map((m: any) => ({
        role: m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content
      })) || []

    const hasExistingConversation = conversationHistory.length > 0

    // Memory
    let memoryContext = ''
    if (agentConfig.memory_enabled) {
      memoryContext = await getContactMemory(supabase, from, userId, agentConfig)
    }

    let semanticContext = ''
    if (agentConfig.semantic_memory_enabled && memoryContext) {
      semanticContext = await searchSimilarMemories(supabase, from, userId, agentConfig)
    }

    // Knowledge Base
    let kbContext: string | null = null
    const knowledgeSourceIds = agentConfig.knowledge_source_ids || []
    if (knowledgeSourceIds.length > 0) {
      kbContext = await searchKnowledgeBase(supabase, knowledgeSourceIds, body, 3)
    }

    // Build system prompt
    const KB_SECTION = kbContext ? `\n\nKNOWLEDGE BASE:\n${kbContext}\n\nBase answers on the knowledge base above when relevant.` : ''
    const MEMORY_SECTION = memoryContext ? `\n\n${memoryContext}` : ''
    const SEMANTIC_SECTION = semanticContext ? `\n\n${semanticContext}` : ''
    const CONTEXT_SUFFIX = `

IMPORTANT CONTEXT:
- You are responding via WhatsApp
- Keep responses BRIEF: 1-3 sentences maximum
- Use friendly, conversational language
- You can use basic formatting (bold *text*, italic _text_) but keep it minimal
${hasExistingConversation ? '- This is an ONGOING conversation - continue naturally, do NOT give a welcome/intro message' : ''}`

    const systemPrompt = agentConfig.system_prompt
      ? `${agentConfig.system_prompt}${KB_SECTION}${MEMORY_SECTION}${SEMANTIC_SECTION}${CONTEXT_SUFFIX}`
      : `You are a helpful AI assistant responding via WhatsApp. Keep replies brief and friendly.${KB_SECTION}${MEMORY_SECTION}${SEMANTIC_SECTION}${CONTEXT_SUFFIX}`

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: body }
    ]

    // Build OpenAI tools from agent's custom_functions (joined via agent_configs)
    const customFunctions: any[] = (agentConfig.custom_functions || []).filter((f: any) => f.is_active)
    const tools = customFunctions.length > 0 ? customFunctions.map((fn: any) => ({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            (fn.body_schema || []).map((p: any) => [
              p.name,
              { type: p.type === 'number' ? 'number' : 'string', description: p.description }
            ])
          ),
          required: (fn.body_schema || []).filter((p: any) => p.required).map((p: any) => p.name),
        },
      },
    })) : undefined

    let reply = ''

    // Agentic loop: call OpenAI, execute any tool calls, repeat until text reply
    for (let i = 0; i < 5; i++) {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          messages,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
        }),
      })

      if (!openaiResponse.ok) {
        console.error('OpenAI error:', await openaiResponse.text())
        return
      }

      const result = await openaiResponse.json()
      const choice = result.choices[0]
      messages.push(choice.message)

      // No tool calls — we have the final text reply
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        reply = choice.message.content || ''
        break
      }

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const fnName = toolCall.function.name
        const fnArgs = { ...JSON.parse(toolCall.function.arguments || '{}'), channel: 'whatsapp', session_id: sessionId }
        const fn = customFunctions.find((f: any) => f.name === fnName)

        let toolResult = 'error: function not found'
        if (fn) {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            if (fn.headers) Object.assign(headers, fn.headers)
            const fnRes = await fetch(fn.endpoint_url, {
              method: fn.http_method || 'POST',
              headers,
              body: JSON.stringify(fnArgs),
            })
            toolResult = await fnRes.text()
            console.log(`Tool call ${fnName}:`, fnArgs, '→', toolResult)
          } catch (err) {
            toolResult = `error: ${err}`
            console.error(`Tool call ${fnName} failed:`, err)
          }
        }

        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult })
      }
    }

    if (!reply) return

    console.log('WhatsApp AI reply:', reply)

    // Send the reply via Meta API
    const waMessageId = await sendWhatsAppMessage(phoneNumberId, from, reply, accessToken)

    if (waMessageId) {
      await supabase.from('sms_messages').insert({
        user_id: userId,
        agent_id: agentConfig.id,
        sender_number: phoneNumberId,
        recipient_number: from,
        direction: 'outbound',
        content: reply,
        status: 'sent',
        sent_at: new Date().toISOString(),
        channel: 'whatsapp',
        external_id: waMessageId,
        is_ai_generated: true,
      })
    }

    // Update memory
    if (agentConfig.memory_enabled) {
      updateContactMemory(supabase, from, phoneNumberId, userId, agentConfig, body, reply)
        .catch((err: any) => console.error('Failed to update WhatsApp memory:', err))
    }
  } catch (error) {
    console.error('Error in processAndReplyWhatsApp:', error)
  }
}

export async function transcribeWhatsAppAudio(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    // Step 1: Get the media download URL from Meta
    const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!mediaRes.ok) {
      console.error('Failed to fetch media metadata:', await mediaRes.text())
      return null
    }
    const mediaData = await mediaRes.json()
    const mediaUrl: string = mediaData.url
    const mimeType: string = mediaData.mime_type || 'audio/ogg'

    // Step 2: Download the audio binary
    const audioRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!audioRes.ok) {
      console.error('Failed to download audio:', await audioRes.text())
      return null
    }
    const audioBuffer = await audioRes.arrayBuffer()

    // Step 3: Transcribe via OpenAI Whisper
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg'
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`)
    formData.append('model', 'whisper-1')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      console.error('Whisper transcription failed:', await whisperRes.text())
      return null
    }
    const whisperData = await whisperRes.json()
    return whisperData.text || null
  } catch (error) {
    console.error('Error transcribing WhatsApp audio:', error)
    return null
  }
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('Meta WhatsApp send error:', error)
      return null
    }

    const result = await response.json()
    const messageId = result.messages?.[0]?.id
    console.log('WhatsApp message sent:', messageId)
    return messageId || null
  } catch (error) {
    console.error('Error sending WhatsApp message:', error)
    return null
  }
}
