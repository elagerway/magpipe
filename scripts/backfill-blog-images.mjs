/**
 * Backfill featured images for published blog posts.
 * Pass --all to regenerate posts that already have images.
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const SUPABASE_URL = 'https://mtxbiyilvgwhbdptysex.supabase.co';
const supabase = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const regenerateAll = process.argv.includes('--all');

async function generateAndUpload(post) {
  console.log(`\n📝 "${post.title}"`);

  const tagList = (post.tags || []).join(', ');
  const postContext = [
    `Title: "${post.title}"`,
    tagList ? `Tags: ${tagList}` : '',
    post.excerpt ? `Summary: ${post.excerpt.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  // Step 1: GPT-4o generates a specific scene
  console.log('  🧠 Generating scene concept...');
  const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
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
  });
  const scene = (await gptRes.json()).choices[0].message.content.trim();
  console.log(`  💡 Scene: ${scene}`);

  const prompt = `${scene}. Photorealistic, shot on a Sony A7R V with 85mm f/1.4 lens, professional photography, no text or logos.`;

  console.log('  🎨 Calling DALL-E 3 (HD)...');
  const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      style: 'vivid',
    }),
  });

  if (!dalleRes.ok) {
    const err = await dalleRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `DALL-E error: ${dalleRes.status}`);
  }

  const tempUrl = (await dalleRes.json()).data[0].url;
  console.log('  ✅ Generated');

  const imgBytes = await (await fetch(tempUrl)).arrayBuffer();
  const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const fileName = `blog-images/${Date.now()}-${slug}.png`;

  const { error: uploadError } = await supabase.storage
    .from('public')
    .upload(fileName, imgBytes, { contentType: 'image/png', upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName);
  console.log(`  🔗 ${urlData.publicUrl}`);

  const { error: updateError } = await supabase
    .from('blog_posts')
    .update({ featured_image_url: urlData.publicUrl })
    .eq('id', post.id);
  if (updateError) throw new Error(`DB update failed: ${updateError.message}`);
  console.log('  ✅ Updated');
}

let query = supabase.from('blog_posts').select('id, title, tags, excerpt, featured_image_url').eq('status', 'published');
if (!regenerateAll) query = query.is('featured_image_url', null);

const { data: posts, error } = await query;
if (error) { console.error('Fetch failed:', error); process.exit(1); }
if (!posts.length) { console.log('✅ Nothing to backfill.'); process.exit(0); }

console.log(`Backfilling ${posts.length} post(s)${regenerateAll ? ' (regenerating all)' : ''}...`);

for (const post of posts) {
  try {
    await generateAndUpload(post);
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
  }
}

console.log('\n✅ Done.');
