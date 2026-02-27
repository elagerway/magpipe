/**
 * Generate Blog Image
 * Uses DALL-E 3 to create a featured image for a blog post,
 * uploads it to Supabase Storage, and returns the public URL.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Require admin auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    const token = authHeader.replace('Bearer ', '')
    await requireAdmin(supabase, token)

    const { title, tags, excerpt } = await req.json()

    if (!title?.trim()) {
      return errorResponse('Title is required to generate an image', 400)
    }

    // Build post context
    const tagList = Array.isArray(tags) && tags.length > 0 ? tags.join(', ') : ''
    const postContext = [
      `Title: "${title}"`,
      tagList ? `Tags: ${tagList}` : '',
      excerpt ? `Summary: ${excerpt.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n')

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) throw new Error('OPENAI_API_KEY not configured')

    // Step 1: Use GPT-4o to generate a specific, context-aware scene description
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You write DALL-E 3 image prompts for blog post hero images. Given a blog post, describe a single specific photorealistic scene that visually captures the post's topic. Rules:
- One concrete scene (e.g. "a close-up of hands holding a smartphone showing an incoming call, shallow depth of field, warm studio light")
- No abstract concepts — show real objects, real people, real environments
- No text, screens with readable text, logos, or UI elements in the scene
- Photorealistic photography style: specify lens, lighting, mood
- Subtle cool-blue or indigo color grading
- Output only the scene description, no preamble`
          },
          { role: 'user', content: postContext }
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    })

    if (!gptRes.ok) {
      const err = await gptRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `GPT error: ${gptRes.status}`)
    }

    const scene = (await gptRes.json()).choices[0].message.content.trim()
    console.log('Generated scene:', scene)

    const prompt = `${scene}. Photorealistic, shot on a Sony A7R V with 85mm f/1.4 lens, professional photography, no text or logos.`

    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        style: 'vivid',
      }),
    })

    if (!dalleRes.ok) {
      const err = await dalleRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `DALL-E API error: ${dalleRes.status}`)
    }

    const dalleData = await dalleRes.json()
    const tempImageUrl = dalleData.data[0].url

    // Download the generated image
    const imgRes = await fetch(tempImageUrl)
    if (!imgRes.ok) throw new Error('Failed to download generated image')
    const imgBytes = await imgRes.arrayBuffer()

    // Upload to Supabase Storage (public bucket)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    const fileName = `blog-images/${Date.now()}-${slug}.png`

    const { error: uploadError } = await supabase.storage
      .from('public')
      .upload(fileName, imgBytes, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName)

    return successResponse({ url: urlData.publicUrl })

  } catch (error) {
    console.error('Error in generate-blog-image:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
