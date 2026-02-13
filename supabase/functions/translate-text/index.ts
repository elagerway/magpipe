import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Verify JWT auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the user's JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { texts, targetLang, cacheType, cacheIds } = await req.json()

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ error: 'texts array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!targetLang) {
      return new Response(JSON.stringify({ error: 'targetLang required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const langNames: Record<string, string> = {
      en: 'English',
      fr: 'French',
      es: 'Spanish',
      de: 'German',
    }
    const targetLangName = langNames[targetLang] || targetLang

    // Translate all texts in a single API call for efficiency
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const prompt = texts.length === 1
      ? `Translate the following text to ${targetLangName}. Return ONLY the translation, no explanations:\n\n${texts[0]}`
      : `Translate each of the following ${texts.length} texts to ${targetLangName}. Return ONLY the translations as a JSON array of strings, one per input text. No explanations.\n\n${JSON.stringify(texts)}`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: `You are a translator. Translate text to ${targetLangName} accurately and naturally.` },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI translation error:', errorText)
      return new Response(JSON.stringify({ error: 'Translation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await openaiResponse.json()
    const rawContent = result.choices[0].message.content.trim()

    let translations: string[]
    if (texts.length === 1) {
      translations = [rawContent]
    } else {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(rawContent)
        translations = Array.isArray(parsed) ? parsed : [rawContent]
      } catch {
        // If not valid JSON, split by newlines as fallback
        translations = rawContent.split('\n').filter((l: string) => l.trim())
      }
    }

    // Cache translations back to DB
    if (cacheType && cacheIds && cacheIds.length > 0) {
      const table = cacheType === 'sms' ? 'sms_messages' : 'call_records'
      const column = cacheType === 'sms' ? 'translation' : 'translated_transcript'

      for (let i = 0; i < Math.min(cacheIds.length, translations.length); i++) {
        await supabase
          .from(table)
          .update({ [column]: translations[i] })
          .eq('id', cacheIds[i])
          .eq('user_id', user.id) // Ensure user owns the record
      }
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('translate-text error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
