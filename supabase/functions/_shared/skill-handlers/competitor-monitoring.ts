/**
 * Competitor Monitoring Skill Handler
 * Fetches competitor URLs via JS-capable content fetcher, compares against
 * previous snapshots, uses LLM to generate a meaningful change summary.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'
import { fetchPageContent } from '../js-content-fetcher.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, isDryRun, supabaseClient, agentSkill } = context
    const supabase = supabaseClient as ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>

    const urls = (config.urls as string[]) || []
    const checkFor = (config.check_for as string) || 'all'
    const digestFormat = (config.digest_format as string) || 'summary'

    if (urls.length === 0) {
      return {
        summary: 'No URLs configured for monitoring.',
        actions_taken: ['skipped_no_urls'],
      }
    }

    if (isDryRun) {
      return {
        summary: `Would monitor ${urls.length} URL(s) for ${checkFor} changes`,
        actions_taken: ['preview'],
        preview: `Monitoring:\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n\nCheck for: ${checkFor}\nFormat: ${digestFormat}`,
        data: { urls, check_for: checkFor },
      }
    }

    // Get previous snapshot from last successful execution
    const { data: lastExecution } = await supabase
      .from('skill_executions')
      .select('result')
      .eq('agent_skill_id', agentSkill.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const previousSnapshots: Record<string, string> =
      ((lastExecution?.result as Record<string, unknown>)?.data as Record<string, unknown>)?.snapshots as Record<string, string> || {}

    // Fetch current content for each URL
    const currentSnapshots: Record<string, string> = {}
    const changes: Array<{ url: string; status: string; details: string }> = []

    for (const url of urls.slice(0, 10)) {
      try {
        const content = await fetchPageContent(url)

        if (!content || !content.text) {
          changes.push({ url, status: 'error', details: 'Failed to fetch content' })
          continue
        }

        // Truncate to 10K chars for snapshot storage
        const textContent = content.text.substring(0, 10000)
        currentSnapshots[url] = textContent

        const previousContent = previousSnapshots[url]
        if (!previousContent) {
          changes.push({ url, status: 'new', details: 'First scan — baseline captured' })
        } else if (textContent === previousContent) {
          changes.push({ url, status: 'unchanged', details: 'No changes detected' })
        } else {
          // Use LLM to summarize what changed
          const diffSummary = await summarizeChanges(url, previousContent, textContent, checkFor)
          changes.push({ url, status: 'changed', details: diffSummary })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Fetch failed'
        changes.push({ url, status: 'error', details: errMsg })
      }
    }

    const changedCount = changes.filter(c => c.status === 'changed').length
    const digest = changes
      .map(c => `${c.status === 'changed' ? '🔴' : c.status === 'new' ? '🟡' : c.status === 'error' ? '⚠️' : '🟢'} ${c.url}\n   ${c.details}`)
      .join('\n\n')

    return {
      summary: changedCount > 0
        ? `Competitor Monitor: ${changedCount} change(s) detected across ${urls.length} URL(s)\n\n${digest}`
        : `Competitor Monitor: No changes detected across ${urls.length} URL(s)\n\n${digest}`,
      actions_taken: changedCount > 0 ? ['changes_detected'] : ['no_changes'],
      data: {
        snapshots: currentSnapshots,
        changes,
        urls_monitored: urls.length,
        changes_detected: changedCount,
      },
    }
  }
}

/**
 * Use OpenAI to summarize what changed between two page snapshots.
 */
async function summarizeChanges(
  url: string,
  previousContent: string,
  currentContent: string,
  checkFor: string
): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    // Fallback to basic diff if no API key
    const diffLength = Math.abs(currentContent.length - previousContent.length)
    return `Content changed (~${diffLength} characters difference). Configure OPENAI_API_KEY for detailed analysis.`
  }

  const checkForInstruction = checkFor === 'pricing_changes'
    ? 'Focus specifically on pricing changes — new prices, removed prices, plan changes, discount changes.'
    : checkFor === 'new_content'
    ? 'Focus specifically on new content — new pages, new features, new blog posts, new announcements.'
    : 'Identify all notable changes — pricing, features, content, messaging, positioning.'

  // Truncate to fit in context
  const prev = previousContent.substring(0, 4000)
  const curr = currentContent.substring(0, 4000)

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
            content: `You are a competitive intelligence analyst. Compare two snapshots of a competitor's webpage and summarize what changed. Be concise (2-3 sentences max). ${checkForInstruction}`,
          },
          {
            role: 'user',
            content: `URL: ${url}\n\n--- PREVIOUS SNAPSHOT ---\n${prev}\n\n--- CURRENT SNAPSHOT ---\n${curr}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('OpenAI error in competitor monitoring:', errText)
      const diffLength = Math.abs(currentContent.length - previousContent.length)
      return `Content changed (~${diffLength} characters difference)`
    }

    const data = await resp.json()
    return data.choices?.[0]?.message?.content?.trim() || 'Content changed (LLM summary unavailable)'
  } catch (err) {
    console.error('LLM summary error:', err)
    const diffLength = Math.abs(currentContent.length - previousContent.length)
    return `Content changed (~${diffLength} characters difference)`
  }
}

export default handler
