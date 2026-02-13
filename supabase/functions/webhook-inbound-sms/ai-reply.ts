import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { generateEmbedding, searchKnowledgeBase } from './knowledge.ts'
import { getContactMemory, searchSimilarMemories, updateContactMemory } from './memory.ts'
import { sendSMS, translateAndCacheSms } from './sms-delivery.ts'
import { sendSlackAgentReply, isWithinSchedule } from './notifications.ts'
import { isOptedOut } from '../_shared/sms-compliance.ts'
import { getAppPrefs } from '../_shared/app-function-prefs.ts'
import { redactPii } from '../_shared/pii-redaction.ts'

export async function processAndReplySMS(
  userId: string,
  from: string,
  to: string,
  body: string,
  supabase: any,
  agentConfig: any,
  slackThread: { channel: string; ts: string; accessToken: string } | null
) {
  try {
    // Check if sender has opted out (USA SMS compliance)
    // Only block if they opted out AND this is a US number
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const toIsUSNumber = await isUSNumber(to, supabase)

    if (toIsUSNumber) {
      const hasOptedOut = await isOptedOut(supabase, from)
      if (hasOptedOut) {
        console.log('Sender has opted out from US number:', to, '- not sending AI reply to:', from)
        return // Don't respond to opted-out users
      }
    }

    // Check if AI is paused for this conversation
    // Note: Separate conversations per service number (different numbers = different threads)
    const { data: context } = await supabase
      .from('conversation_contexts')
      .select('ai_paused_until')
      .eq('user_id', userId)
      .eq('contact_phone', from)
      .eq('service_number', to)
      .single()

    if (context?.ai_paused_until) {
      const pausedUntil = new Date(context.ai_paused_until)
      const now = new Date()

      if (pausedUntil > now) {
        console.log(`AI is paused for this conversation until ${pausedUntil.toISOString()}`)
        return // Don't respond
      }
    }

    // Agent config is now passed in - no need to fetch again
    if (!agentConfig) {
      console.log('No agent configured for user')
      return
    }

    // Check if agent is active - don't respond if inactive
    if (agentConfig.is_active === false) {
      console.log('Agent is inactive, not responding to SMS:', agentConfig.id, agentConfig.name || 'Unnamed')
      return
    }

    // Check if within texts schedule
    let smsAfterHours = false
    if (agentConfig.texts_schedule) {
      const inSchedule = isWithinSchedule(agentConfig.texts_schedule, agentConfig.schedule_timezone)
      if (!inSchedule) {
        console.log('SMS outside scheduled hours for agent:', agentConfig.id, agentConfig.name || 'Unnamed')
        smsAfterHours = true

        // If SMS forwarding number is configured, forward and auto-reply
        const smsForwardingNumber = agentConfig.after_hours_sms_forwarding
        if (smsForwardingNumber) {
          console.log('Forwarding after-hours SMS to:', smsForwardingNumber)
          const forwardBody = `After-hours SMS from ${from}: ${body}`
          await sendSMS(userId, smsForwardingNumber, to, forwardBody, supabase, false)
        }
        // Send off-duty message and stop processing
        console.log('Sending off-duty auto-reply')
        await sendSMS(userId, from, to, 'This Magpipe agent is currently off duty.', supabase, false)
        return
      }
    }

    // Get recent conversation history for context
    const { data: recentMessages } = await supabase
      .from('sms_messages')
      .select('content, direction, sent_at')
      .eq('user_id', userId)
      .or(`sender_number.eq.${from},recipient_number.eq.${from}`)
      .order('sent_at', { ascending: false })
      .limit(6) // Get last 6 messages (including the one just received)

    // Build conversation history (exclude the current message, reverse to chronological order)
    const conversationHistory = recentMessages
      ?.filter(m => m.content !== body) // Exclude current message
      ?.reverse()
      ?.map(m => ({
        role: m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content
      })) || []

    const hasExistingConversation = conversationHistory.length > 0
    console.log('Conversation history found:', hasExistingConversation, 'messages:', conversationHistory.length)

    // Get contact memory for context injection
    let memoryContext = ''
    if (agentConfig.memory_enabled) {
      memoryContext = await getContactMemory(supabase, from, userId, agentConfig)
    }

    // Search for similar memories from OTHER contacts (semantic memory)
    let semanticContext = ''
    if (agentConfig.semantic_memory_enabled && memoryContext) {
      semanticContext = await searchSimilarMemories(supabase, from, userId, agentConfig)
    }

    // Search Knowledge Base for relevant context
    let kbContext: string | null = null
    const knowledgeSourceIds = agentConfig.knowledge_source_ids || []
    if (knowledgeSourceIds.length > 0) {
      console.log('Searching KB for agent with', knowledgeSourceIds.length, 'knowledge sources')
      kbContext = await searchKnowledgeBase(supabase, knowledgeSourceIds, body, 3)
      if (kbContext) {
        console.log('📚 KB context found, length:', kbContext.length)
      }
    }

    // For SMS, use OpenAI to generate intelligent responses
    // Use SMS-specific prompt or fall back to system_prompt adapted for SMS

    // Language instructions for SMS (mirrors voice agent but adapted for text)
    const SMS_LANGUAGE_INSTRUCTIONS: Record<string, string> = {
      'en-US': '',
      'multi': 'LANGUAGE: Detect the language of the incoming message and respond in the SAME language. If unclear, default to English.\n\n',
      'fr': 'LANGUE: Tu DOIS répondre UNIQUEMENT en français.\nLANGUAGE: You MUST respond ONLY in French.\n\n',
      'es': 'IDIOMA: Debes responder ÚNICAMENTE en español.\nLANGUAGE: You MUST respond ONLY in Spanish.\n\n',
      'de': 'SPRACHE: Du musst AUSSCHLIESSLICH auf Deutsch antworten.\nLANGUAGE: You MUST respond ONLY in German.\n\n',
    }

    const agentLanguage = agentConfig.language || 'en-US'
    const langPrefix = SMS_LANGUAGE_INSTRUCTIONS[agentLanguage] || ''

    // Localized SMS context suffixes
    const SMS_CONTEXT_SUFFIXES: Record<string, string> = {
      'en-US': `

IMPORTANT CONTEXT:
- You are responding via SMS TEXT MESSAGE (not a voice call)
- The customer is TEXTING you, not calling
- Keep responses BRIEF: 1-2 sentences maximum
- Use casual, friendly text message language
- NEVER mention: "calling", "call back", "speak", "talk", "phone call", "voice"
- ALWAYS use text-appropriate language: "text", "message", "reply", "send"
- If they ask to talk/call, say: "I can help via text, or you can call ${to} to speak with someone"
- This is asynchronous messaging - they may not respond immediately
${hasExistingConversation ? '- This is an ONGOING conversation - respond naturally to continue it, do NOT give a welcome/intro message' : ''}`,

      'fr': `

CONTEXTE IMPORTANT:
- Tu réponds par SMS (pas par appel vocal)
- Le client t'envoie un MESSAGE TEXTE, pas un appel
- Garde tes réponses BRÈVES: 1-2 phrases maximum
- Utilise un langage décontracté et amical
- Ne JAMAIS mentionner: "appeler", "rappeler", "parler", "appel téléphonique", "voix"
- TOUJOURS utiliser un langage adapté au texte: "texto", "message", "répondre", "envoyer"
- S'ils veulent parler/appeler, dis: "Je peux vous aider par texto, ou appelez le ${to} pour parler à quelqu'un"
- C'est une messagerie asynchrone - ils ne répondront pas forcément immédiatement
${hasExistingConversation ? '- C\'est une conversation EN COURS - réponds naturellement pour la continuer, ne donne PAS de message de bienvenue/intro' : ''}`,

      'es': `

CONTEXTO IMPORTANTE:
- Estás respondiendo por SMS (no por llamada de voz)
- El cliente te está enviando un MENSAJE DE TEXTO, no llamando
- Mantén las respuestas BREVES: 1-2 oraciones máximo
- Usa un lenguaje casual y amigable
- NUNCA menciones: "llamar", "devolver la llamada", "hablar", "llamada telefónica", "voz"
- SIEMPRE usa lenguaje apropiado para texto: "texto", "mensaje", "responder", "enviar"
- Si quieren hablar/llamar, di: "Puedo ayudarte por texto, o llama al ${to} para hablar con alguien"
- Es mensajería asíncrona - puede que no respondan inmediatamente
${hasExistingConversation ? '- Esta es una conversación EN CURSO - responde naturalmente para continuarla, NO des un mensaje de bienvenida/intro' : ''}`,

      'de': `

WICHTIGER KONTEXT:
- Du antwortest per SMS (nicht per Sprachanruf)
- Der Kunde schreibt dir eine TEXTNACHRICHT, ruft nicht an
- Halte Antworten KURZ: maximal 1-2 Sätze
- Verwende lockere, freundliche Sprache
- NIEMALS erwähnen: "anrufen", "zurückrufen", "sprechen", "Telefonat", "Stimme"
- IMMER textgerechte Sprache verwenden: "SMS", "Nachricht", "antworten", "senden"
- Wenn sie anrufen möchten, sage: "Ich kann dir per SMS helfen, oder ruf ${to} an, um mit jemandem zu sprechen"
- Dies ist asynchrone Kommunikation - sie antworten möglicherweise nicht sofort
${hasExistingConversation ? '- Dies ist ein LAUFENDES Gespräch - antworte natürlich, um es fortzusetzen, gib KEINE Willkommens-/Intro-Nachricht' : ''}`,
    }

    // Use localized suffix, falling back to English for 'multi' and unknown languages
    const SMS_CONTEXT_SUFFIX = SMS_CONTEXT_SUFFIXES[agentLanguage] || SMS_CONTEXT_SUFFIXES['en-US']

    // Build KB context section if available
    const KB_CONTEXT_SECTION = kbContext ? `

KNOWLEDGE BASE - USE THIS INFORMATION TO ANSWER QUESTIONS:
${kbContext}

IMPORTANT: Base your answers on the knowledge base information above. If the question is not covered in the knowledge base, you can provide a general helpful response, but prefer the KB content when relevant.
` : ''

    // Build memory context section if available
    const MEMORY_CONTEXT_SECTION = memoryContext ? `\n\n${memoryContext}` : ''

    // Build semantic context section if available
    const SEMANTIC_CONTEXT_SECTION = semanticContext ? `\n\n${semanticContext}` : ''

    const smsPrompt = agentConfig.system_prompt
      ? `${langPrefix}${agentConfig.system_prompt}${KB_CONTEXT_SECTION}${MEMORY_CONTEXT_SECTION}${SEMANTIC_CONTEXT_SECTION}${SMS_CONTEXT_SUFFIX}`
      : `${langPrefix}You are Maggie, a helpful AI assistant. You are responding to an SMS text message. Reply in a friendly and concise way. Keep responses brief (1-2 sentences max). Do not reference phone calls - this is a text message conversation.${KB_CONTEXT_SECTION}${MEMORY_CONTEXT_SECTION}${SEMANTIC_CONTEXT_SECTION}${SMS_CONTEXT_SUFFIX}`

    const systemPrompt = smsPrompt

    console.log('SMS system prompt applied with context suffix, hasExistingConversation:', hasExistingConversation)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: body }
    ]

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: messages,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', errorText)
      // Fallback to simple response
      const reply = "Hi! I'm Maggie, your AI assistant. Sorry, I'm having trouble processing your message right now. Please try again later."
      await sendSMS(userId, from, to, reply, supabase)
      return
    }

    const openaiResult = await openaiResponse.json()
    const reply = openaiResult.choices[0].message.content

    console.log('OpenAI generated reply:', reply)

    // Send the reply (pass PII mode for outbound content storage)
    const smsPiiStorage = agentConfig?.pii_storage || 'enabled'
    await sendSMS(userId, from, to, reply, supabase, true, smsPiiStorage)

    // Send agent reply to Slack thread if we have thread info
    if (slackThread) {
      const agentName = agentConfig?.name || 'AI Assistant'
      await sendSlackAgentReply(slackThread, agentName, reply)
    }

    // Auto-translate messages if translate_to is configured (fire and forget)
    if (agentConfig.translate_to) {
      const slackTranslationsOn = getAppPrefs(agentConfig?.functions, 'slack').translations
      translateAndCacheSms(supabase, agentConfig.translate_to, from, to, userId, body, reply, slackThread, slackTranslationsOn)
        .catch(err => console.error('Failed to auto-translate SMS:', err))
    }

    // Update contact memory with SMS exchange (fire and forget)
    // Skip memory update in disabled mode; use redacted text in redacted mode
    if (agentConfig.memory_enabled && smsPiiStorage !== 'disabled') {
      const memoryInbound = smsPiiStorage === 'redacted' ? await redactPii(body) : body
      const memoryOutbound = smsPiiStorage === 'redacted' ? await redactPii(reply) : reply
      updateContactMemory(supabase, from, to, userId, agentConfig, memoryInbound, memoryOutbound)
        .catch(err => console.error('Failed to update SMS memory:', err))
    }
  } catch (error) {
    console.error('Error in processAndReplySMS:', error)
  }
}
