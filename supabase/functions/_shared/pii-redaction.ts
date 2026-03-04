/**
 * PII Redaction Utility
 * Detects and redacts personally identifiable information using OpenAI
 */

/**
 * Redact PII from text using OpenAI
 * Replaces names, phone numbers, emails, addresses, SSNs, DOBs, account numbers with [REDACTED]
 * Preserves speaker labels (e.g. "Caller:", "Agent:") and conversation structure
 * Fails open: returns original text if OpenAI call fails
 */
export async function redactPii(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.warn('OPENAI_API_KEY not set, skipping PII redaction')
    return text
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
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a PII redaction tool. Replace all personally identifiable information in the text with [REDACTED].

PII to redact:
- Personal names (first, last, full names)
- Phone numbers
- Email addresses
- Physical addresses (street, city, zip)
- Social Security Numbers
- Dates of birth
- Account numbers, credit card numbers
- Any other identifying information

Rules:
- Keep speaker labels intact (e.g. "Caller:", "Agent:", "Maggie:", etc.)
- Keep the conversation structure and formatting exactly the same
- Only replace the PII values, not surrounding text
- Do NOT add any explanation or commentary
- Return ONLY the redacted text`
          },
          {
            role: 'user',
            content: text
          }
        ],
      }),
    })

    if (!response.ok) {
      console.error('OpenAI PII redaction error:', await response.text())
      return text // fail open
    }

    const result = await response.json()
    const redacted = result.choices[0]?.message?.content?.trim()

    if (!redacted) {
      console.warn('Empty PII redaction response, returning original')
      return text
    }

    return redacted
  } catch (error) {
    console.error('PII redaction error:', error)
    return text // fail open
  }
}

/**
 * Redact PII from string values in a JSON object
 * Used for extracted data (dynamic variables)
 */
export async function redactPiiFromObject(data: Record<string, any>): Promise<Record<string, any>> {
  if (!data || Object.keys(data).length === 0) {
    return data
  }

  const redacted: Record<string, any> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      redacted[key] = await redactPii(value)
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      // Booleans and numbers are not PII (e.g. urgent: true)
      redacted[key] = value
    } else if (value === null || value === undefined) {
      redacted[key] = value
    } else {
      // For complex values, stringify and redact
      const stringified = JSON.stringify(value)
      const redactedStr = await redactPii(stringified)
      try {
        redacted[key] = JSON.parse(redactedStr)
      } catch {
        redacted[key] = redactedStr
      }
    }
  }

  return redacted
}
