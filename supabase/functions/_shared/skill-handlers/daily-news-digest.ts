/**
 * Daily News Digest Skill Handler
 * Searches for industry news using Serper API and generates an LLM executive summary.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, isDryRun } = context

    const topics = (config.topics as string[]) || []
    const sources = (config.sources as string[]) || []
    const digestFormat = (config.digest_format as string) || 'summary'

    if (topics.length === 0) {
      return {
        summary: 'No topics configured for news digest.',
        actions_taken: ['skipped_no_topics'],
      }
    }

    if (isDryRun) {
      return {
        summary: `Would search news for ${topics.length} topic(s)`,
        actions_taken: ['preview'],
        preview: `Topics: ${topics.join(', ')}\nSources: ${sources.length > 0 ? sources.join(', ') : 'All'}\nFormat: ${digestFormat}`,
        data: { topics, sources },
      }
    }

    const serperApiKey = Deno.env.get('SERPER_API_KEY')
    if (!serperApiKey) {
      return {
        summary: 'Serper API key not configured. Cannot fetch news.',
        actions_taken: ['error_no_api_key'],
      }
    }

    // Search news for each topic
    const allResults: Array<{ topic: string; articles: Array<{ title: string; link: string; snippet: string; date: string; source: string }> }> = []

    for (const topic of topics.slice(0, 10)) {
      try {
        const query = sources.length > 0
          ? `${topic} site:${sources.join(' OR site:')}`
          : topic

        const response = await fetch('https://google.serper.dev/news', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            num: 5,
            tbs: 'qdr:d',
          }),
        })

        if (!response.ok) continue

        const data = await response.json()
        const articles = (data.news || []).map((item: Record<string, string>) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          date: item.date || '',
          source: item.source || '',
        }))

        allResults.push({ topic, articles })
      } catch (err) {
        console.error(`News search error for "${topic}":`, err)
        allResults.push({ topic, articles: [] })
      }
    }

    // Deduplicate by link
    const seenLinks = new Set<string>()
    for (const result of allResults) {
      result.articles = result.articles.filter(a => {
        if (seenLinks.has(a.link)) return false
        seenLinks.add(a.link)
        return true
      })
    }

    const totalArticles = allResults.reduce((sum, r) => sum + r.articles.length, 0)

    if (totalArticles === 0) {
      return {
        summary: 'No news found for your topics in the last 24 hours.',
        actions_taken: ['no_news'],
        data: { topics, articles_found: 0 },
      }
    }

    // Build article listing
    const articleListing = allResults
      .filter(r => r.articles.length > 0)
      .map(r => {
        const articleList = r.articles
          .map(a => `• ${a.title}${a.source ? ` (${a.source})` : ''}\n  ${a.snippet}\n  ${a.link}`)
          .join('\n\n')
        return `📰 *${r.topic}*\n${articleList}`
      })
      .join('\n\n---\n\n')

    // Generate LLM executive summary for "summary" format
    let executiveSummary = ''
    if (digestFormat === 'summary') {
      executiveSummary = await generateExecutiveSummary(allResults)
    }

    const digest = executiveSummary
      ? `${executiveSummary}\n\n---\n\n${articleListing}`
      : articleListing

    return {
      summary: `Daily News Digest: ${totalArticles} article(s) across ${topics.length} topic(s)\n\n${digest}`,
      actions_taken: ['digest_generated'],
      data: {
        topics,
        articles_found: totalArticles,
        results: allResults,
      },
    }
  }
}

/**
 * Generate a concise executive summary of all news articles using LLM.
 */
async function generateExecutiveSummary(
  results: Array<{ topic: string; articles: Array<{ title: string; snippet: string }> }>
): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) return ''

  // Build article context for the LLM
  const articleContext = results
    .filter(r => r.articles.length > 0)
    .map(r => {
      const articles = r.articles.map(a => `- ${a.title}: ${a.snippet}`).join('\n')
      return `Topic: ${r.topic}\n${articles}`
    })
    .join('\n\n')

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
            content: `You are a business intelligence analyst. Summarize today's news for a busy business owner.

Format:
- Start with a one-line headline (bold the key insight)
- Then 3-5 bullet points, each one sentence covering a key theme
- End with a "Bottom line:" one-liner with the actionable takeaway

Keep it scannable and concise.`,
          },
          {
            role: 'user',
            content: `Here are today's news articles:\n\n${articleContext}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
    })

    if (!resp.ok) {
      console.error('OpenAI error in news digest:', await resp.text())
      return ''
    }

    const data = await resp.json()
    const summary = data.choices?.[0]?.message?.content?.trim()
    return summary ? `📋 *Executive Summary*\n${summary}` : ''
  } catch (err) {
    console.error('LLM summary error:', err)
    return ''
  }
}

export default handler
