/**
 * Process Review Requests
 * Called daily by pg_cron. Finds eligible users (≥25 calls, not asked in 90 days)
 * and sends review request emails via Postmark, rotating between G2, Capterra, Product Hunt.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const PLATFORMS = ['g2', 'capterra', 'producthunt'] as const
const CALL_THRESHOLD = 25
const COOLDOWN_DAYS = 90

const PLATFORM_URLS: Record<string, string> = {
  g2: 'https://www.g2.com/products/magpipe/reviews',
  capterra: 'https://www.capterra.com/reviews/magpipe',
  producthunt: 'https://www.producthunt.com/products/magpipe/reviews',
}

const PLATFORM_NAMES: Record<string, string> = {
  g2: 'G2',
  capterra: 'Capterra',
  producthunt: 'Product Hunt',
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Find eligible users: ≥25 calls AND no review request in last 90 days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - COOLDOWN_DAYS)

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, usage_calls_count')
      .gte('usage_calls_count', CALL_THRESHOLD)
      .eq('account_status', 'active')

    if (usersError) {
      console.error('Failed to query users:', usersError)
      return new Response(JSON.stringify({ error: 'Failed to query users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!users || users.length === 0) {
      console.log('No eligible users found')
      return new Response(JSON.stringify({ message: 'No eligible users', processed: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Get recent review requests to filter out users asked in last 90 days
    const { data: recentRequests, error: recentError } = await supabase
      .from('review_requests')
      .select('user_id, platform')
      .gte('created_at', cutoffDate.toISOString())

    if (recentError) {
      console.error('Failed to query recent requests:', recentError)
      return new Response(JSON.stringify({ error: 'Failed to query recent requests' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const recentlyAskedUserIds = new Set((recentRequests || []).map(r => r.user_id))

    // Filter to users not recently asked
    const eligibleUsers = users.filter(u => !recentlyAskedUserIds.has(u.id))

    if (eligibleUsers.length === 0) {
      console.log('All eligible users were recently asked')
      return new Response(JSON.stringify({ message: 'All eligible users recently asked', processed: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Get platform counts for rotation (pick the platform with fewest requests)
    const { data: platformCounts, error: countError } = await supabase
      .from('review_requests')
      .select('platform')

    const counts: Record<string, number> = { g2: 0, capterra: 0, producthunt: 0 }
    if (!countError && platformCounts) {
      for (const row of platformCounts) {
        if (counts[row.platform] !== undefined) {
          counts[row.platform]++
        }
      }
    }

    // 4. Process each eligible user
    const results: Array<{ userId: string; email: string; platform: string; success: boolean; error?: string }> = []

    for (const user of eligibleUsers) {
      // Pick platform with fewest existing requests
      const platform = PLATFORMS.reduce((a, b) => (counts[a] <= counts[b] ? a : b))
      const platformName = PLATFORM_NAMES[platform]
      const platformUrl = PLATFORM_URLS[platform]
      const userName = user.name || user.email.split('@')[0]

      try {
        // Insert review request record as pending
        const { data: request, error: insertError } = await supabase
          .from('review_requests')
          .insert({
            user_id: user.id,
            user_email: user.email,
            user_name: userName,
            platform,
            status: 'pending',
            call_count_at_send: user.usage_calls_count,
          })
          .select()
          .single()

        if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

        // Send email via Postmark
        const emailResponse = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': postmarkApiKey,
          },
          body: JSON.stringify({
            From: 'Magpipe <hello@magpipe.ai>',
            To: user.email,
            Subject: `${userName}, share your Magpipe experience on ${platformName}?`,
            HtmlBody: buildEmailHtml(userName, platformName, platformUrl, user.usage_calls_count),
            TextBody: buildEmailText(userName, platformName, platformUrl, user.usage_calls_count),
            MessageStream: 'outbound',
          }),
        })

        const emailResult = await emailResponse.json()

        if (!emailResponse.ok) {
          throw new Error(`Postmark error: ${emailResult.Message || 'Unknown'}`)
        }

        // Update record to sent
        await supabase
          .from('review_requests')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            postmark_message_id: emailResult.MessageID,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)

        // Increment the platform count for rotation
        counts[platform]++

        results.push({ userId: user.id, email: user.email, platform, success: true })
      } catch (err: any) {
        console.error(`Failed to process user ${user.email}:`, err)

        // Try to update the record as failed
        await supabase
          .from('review_requests')
          .update({
            status: 'failed',
            error_message: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)

        results.push({ userId: user.id, email: user.email, platform, success: false, error: err.message })
      }
    }

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`Review requests processed: ${sent} sent, ${failed} failed`)

    return new Response(JSON.stringify({ processed: results.length, sent, failed, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error in process-review-requests:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function buildEmailHtml(name: string, platformName: string, platformUrl: string, callCount: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #7c3aed; font-size: 24px; margin: 0;">Magpipe</h1>
  </div>

  <p>Hi ${name},</p>

  <p>You've handled <strong>${callCount} calls</strong> through Magpipe — that's awesome! We'd love to hear how it's going.</p>

  <p>Would you take 2 minutes to leave a quick review on <strong>${platformName}</strong>? It really helps other businesses discover us.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${platformUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
      Leave a Review on ${platformName}
    </a>
  </div>

  <p>Thanks for being part of the Magpipe community!</p>

  <p style="margin-top: 30px;">
    — The Magpipe Team
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  <p style="font-size: 12px; color: #9ca3af; text-align: center;">
    You received this because you're an active Magpipe user. No action required if you'd prefer not to leave a review.
  </p>
</body>
</html>`
}

function buildEmailText(name: string, platformName: string, platformUrl: string, callCount: number): string {
  return `Hi ${name},

You've handled ${callCount} calls through Magpipe — that's awesome! We'd love to hear how it's going.

Would you take 2 minutes to leave a quick review on ${platformName}? It really helps other businesses discover us.

Leave a review: ${platformUrl}

Thanks for being part of the Magpipe community!

— The Magpipe Team`
}
