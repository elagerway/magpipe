/**
 * Sentiment Analysis Utility
 * Analyzes text sentiment using OpenAI
 */

export type Sentiment = 'positive' | 'neutral' | 'negative'

/**
 * Analyze sentiment of text using OpenAI
 * @param text - The text to analyze (caller's messages only for calls)
 * @returns The sentiment: 'positive', 'neutral', or 'negative'
 */
export async function analyzeSentiment(text: string): Promise<Sentiment> {
  if (!text || text.trim().length === 0) {
    return 'neutral'
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.warn('OPENAI_API_KEY not set, defaulting to neutral sentiment')
    return 'neutral'
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a sentiment analyzer. Analyze the overall sentiment of the user's message(s) and respond with exactly one word: "positive", "neutral", or "negative".

Guidelines:
- positive: Happy, satisfied, grateful, excited, pleased, friendly, appreciative
- negative: Angry, frustrated, disappointed, upset, annoyed, complaining, hostile
- neutral: Informational, matter-of-fact, neither positive nor negative, unclear

Respond with only the sentiment word, nothing else.`
          },
          {
            role: 'user',
            content: text
          }
        ],
      }),
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return 'neutral'
    }

    const result = await response.json()
    const sentiment = result.choices[0]?.message?.content?.trim().toLowerCase()

    if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
      return sentiment
    }

    console.warn('Unexpected sentiment response:', sentiment)
    return 'neutral'
  } catch (error) {
    console.error('Sentiment analysis error:', error)
    return 'neutral'
  }
}

/**
 * Extract caller's messages from a transcript
 * Looks for patterns like "User:", "Caller:", "Customer:", or messages not from "Agent:", "Assistant:", "AI:"
 * @param transcript - The full conversation transcript
 * @returns The caller's messages concatenated
 */
export function extractCallerMessages(transcript: string): string {
  if (!transcript) return ''

  const lines = transcript.split('\n')
  const callerMessages: string[] = []

  // Common patterns for identifying speakers
  const agentPatterns = /^(agent|assistant|ai|pat|bot):/i
  const callerPatterns = /^(user|caller|customer|human|client):/i

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Skip agent messages
    if (agentPatterns.test(trimmedLine)) {
      continue
    }

    // Include caller messages
    if (callerPatterns.test(trimmedLine)) {
      // Remove the speaker label
      const message = trimmedLine.replace(callerPatterns, '').trim()
      if (message) {
        callerMessages.push(message)
      }
    } else if (!trimmedLine.includes(':') || /^\d{1,2}:\d{2}/.test(trimmedLine)) {
      // Include lines without speaker labels (might be continuation)
      // But skip timestamp-only lines
      if (!/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i.test(trimmedLine)) {
        callerMessages.push(trimmedLine)
      }
    }
  }

  return callerMessages.join(' ')
}
