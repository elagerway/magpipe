/**
 * Social Media Monitoring Skill Handler
 * Tracks brand mentions across Reddit, HackerNews, and Google using Serper API.
 * Follows the existing process-social-listening pattern.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, isDryRun, supabaseClient, agentSkill } = context
    const supabase = supabaseClient as ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>

    const keywords = (config.keywords as string[]) || []
    const platforms = (config.platforms as string[]) || ['reddit', 'hackernews', 'google']
    const digestFormat = (config.digest_format as string) || 'summary'

    if (keywords.length === 0) {
      return {
        summary: 'No keywords configured for monitoring.',
        actions_taken: ['skipped_no_keywords'],
      }
    }

    if (isDryRun) {
      return {
        summary: `Would monitor ${keywords.length} keyword(s) across ${platforms.join(', ')}`,
        actions_taken: ['preview'],
        preview: `Keywords: ${keywords.join(', ')}\nPlatforms: ${platforms.join(', ')}\nFormat: ${digestFormat}`,
        data: { keywords, platforms },
      }
    }

    const serperApiKey = Deno.env.get('SERPER_API_KEY')
    if (!serperApiKey) {
      return {
        summary: 'Serper API key not configured.',
        actions_taken: ['error_no_api_key'],
      }
    }

    // Get previous results for dedup
    const { data: lastExecution } = await supabase
      .from('skill_executions')
      .select('result')
      .eq('agent_skill_id', agentSkill.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const previousLinks = new Set<string>(
      ((lastExecution?.result as Record<string, unknown>)?.all_links as string[]) || []
    )

    const allMentions: Array<{ keyword: string; platform: string; title: string; link: string; snippet: string }> = []
    const allLinks: string[] = []

    for (const keyword of keywords.slice(0, 10)) {
      for (const platform of platforms) {
        try {
          let query = keyword
          if (platform === 'reddit') query = `${keyword} site:reddit.com`
          else if (platform === 'hackernews') query = `${keyword} site:news.ycombinator.com`
          else if (platform === 'x') query = `${keyword} site:x.com OR site:twitter.com`
          else if (platform === 'linkedin') query = `${keyword} site:linkedin.com`

          const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
              'X-API-KEY': serperApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: query,
              num: 5,
              tbs: 'qdr:d', // last 24 hours
            }),
          })

          if (!response.ok) continue

          const data = await response.json()
          const results = data.organic || []

          // Filter results to only include URLs from the target platform
          // Serper sometimes returns off-site results when no exact matches exist
          const PLATFORM_DOMAINS: Record<string, string[]> = {
            reddit: ['reddit.com'],
            hackernews: ['news.ycombinator.com'],
            x: ['x.com', 'twitter.com'],
            linkedin: ['linkedin.com'],
          }
          const requiredDomains = PLATFORM_DOMAINS[platform]

          for (const item of results) {
            // If platform has domain requirements, filter out off-site results
            if (requiredDomains && !requiredDomains.some(d => item.link?.includes(d))) continue

            allLinks.push(item.link)
            // Dedup against previous execution
            if (!previousLinks.has(item.link)) {
              allMentions.push({
                keyword,
                platform,
                title: item.title,
                link: item.link,
                snippet: item.snippet || '',
              })
            }
          }
        } catch (err) {
          console.error(`Search error for "${keyword}" on ${platform}:`, err)
        }
      }
    }

    if (allMentions.length === 0) {
      return {
        summary: 'Social Media Monitor: No new mentions found.',
        actions_taken: ['no_new_mentions'],
        data: { keywords, platforms, new_mentions: 0, all_links: allLinks },
      }
    }

    // Group by platform
    const PLATFORM_LABELS: Record<string, string> = {
      reddit: 'Reddit', hackernews: 'Hacker News', x: 'X (Twitter)', linkedin: 'LinkedIn', google: 'Google',
    }
    const byPlatform: Record<string, typeof allMentions> = {}
    for (const mention of allMentions) {
      if (!byPlatform[mention.platform]) byPlatform[mention.platform] = []
      byPlatform[mention.platform].push(mention)
    }

    const mentionListing = Object.entries(byPlatform)
      .map(([platform, mentions]) => {
        const label = PLATFORM_LABELS[platform] || platform
        const mentionList = mentions
          .map(m => `• ${m.title}\n  ${m.link}`)
          .join('\n')
        return `📡 *${label}* (${mentions.length})\n${mentionList}`
      })
      .join('\n\n')

    // Generate LLM summary of mentions
    const executiveSummary = await generateMentionsSummary(allMentions, keywords)

    const digest = executiveSummary
      ? `${executiveSummary}\n\n---\n\n${mentionListing}`
      : mentionListing

    return {
      summary: `Social Media Monitor: ${allMentions.length} new mention(s) found\n\n${digest}`,
      actions_taken: ['mentions_found'],
      data: {
        keywords,
        platforms,
        new_mentions: allMentions.length,
        mentions: allMentions,
        all_links: allLinks,
      },
    }
  }
}

/**
 * Generate a concise summary of social media mentions using LLM.
 */
async function generateMentionsSummary(
  mentions: Array<{ keyword: string; platform: string; title: string; snippet: string }>,
  keywords: string[]
): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) return ''

  const mentionContext = mentions
    .slice(0, 20) // limit context size
    .map(m => `[${m.platform}] ${m.title}: ${m.snippet}`)
    .join('\n')

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `You are a social media analyst. Summarize brand/keyword mentions for a business owner.

Format:
- One-line headline with the key finding
- 3-5 bullet points covering: sentiment, top themes, notable conversations, platform breakdown
- "Action items:" 1-2 things worth responding to or watching

Be concise and actionable. Keywords being tracked: ${keywords.join(', ')}`,
          },
          {
            role: 'user',
            content: `Here are ${mentions.length} new mentions:\n\n${mentionContext}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
    })

    if (!resp.ok) {
      console.error('OpenAI error in social monitoring:', await resp.text())
      return ''
    }

    const data = await resp.json()
    const summary = data.choices?.[0]?.message?.content?.trim()
    return summary ? `📋 *Summary*\n${summary}` : ''
  } catch (err) {
    console.error('LLM summary error:', err)
    return ''
  }
}

export default handler
