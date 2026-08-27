/**
 * Generate Blog Image
 * Uses OpenAI gpt-image-1 to create a featured image for a blog post,
 * uploads it to Supabase Storage, and returns the public URL.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

// Identify an image by its magic bytes so the stored object's content-type/extension
// match the real payload (defends against the model not honoring output_format). #99
function detectImageType(b: Uint8Array): { contentType: string; ext: string } {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { contentType: 'image/webp', ext: 'webp' }
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { contentType: 'image/png', ext: 'png' }
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' }
  }
  return { contentType: 'image/webp', ext: 'webp' } // we requested webp; default if unrecognized
}

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
            content: `You write image-generation prompts for blog post hero images. Given a blog post, describe a single specific, hyper-realistic photographic scene that captures the VALUE the post delivers to the reader. Rules:
- One concrete scene built from real objects, environments, materials, or visual metaphors (e.g. "a sturdy brushed-steel barrier deflecting a scatter of red paper envelopes, calm dark studio backdrop, shallow depth of field")
- NEVER include people, humans, hands, faces, or any body parts
- No text, readable screens, logos, or UI elements in the scene
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

    // gpt-image-1: the current OpenAI image model. Note vs the old dall-e-3 call:
    // it does NOT accept `style` or `response_format`, `quality` is low|medium|high|auto
    // (not 'standard'), and it ALWAYS returns base64 (no URL). We ask for WebP directly
    // via output_format, so no separate compression step is needed. (#99)
    const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
        output_format: 'webp',
      }),
    })

    if (!imgRes.ok) {
      const err = await imgRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `Image API error: ${imgRes.status}`)
    }

    const imgData = await imgRes.json()
    const b64 = imgData.data?.[0]?.b64_json
    if (!b64) throw new Error('Image API returned no image data')
    let uploadBytes: Uint8Array
    try {
      uploadBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    } catch (e) {
      throw new Error(`Failed to decode image data: ${(e as Error).message}`)
    }
    // Label by the ACTUAL bytes, not the requested format — gpt-image-1 should honor
    // output_format:webp, but never serve PNG/JPEG mislabeled as webp if it doesn't. (#99 review)
    const { contentType, ext } = detectImageType(uploadBytes)

    // Upload to Supabase Storage (public bucket)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    const fileName = `blog-images/${Date.now()}-${slug}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('public')
      .upload(fileName, uploadBytes, {
        contentType,
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
