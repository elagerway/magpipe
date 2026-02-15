/**
 * Admin Reviews API
 * CRUD operations for review request management
 *
 * Actions:
 * - list_reviews: Get all review requests with user info
 * - send_review: Manually create + send a review request
 * - update_review: Update status, notes
 * - delete_review: Delete a record
 * - get_stats: Aggregate counts by platform and status
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

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

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'list_reviews':
        return await handleListReviews(supabase)
      case 'send_review':
        return await handleSendReview(supabase, body)
      case 'update_review':
        return await handleUpdateReview(supabase, body)
      case 'delete_review':
        return await handleDeleteReview(supabase, body)
      case 'get_stats':
        return await handleGetStats(supabase)
      case 'list_users':
        return await handleListUsers(supabase)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error('Error in admin-reviews-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

async function handleListReviews(supabase: any) {
  const { data, error } = await supabase
    .from('review_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return errorResponse('Failed to list reviews: ' + error.message, 500)
  return successResponse({ reviews: data })
}

async function handleSendReview(supabase: any, body: any) {
  const { user_id, platform } = body
  if (!user_id || !platform) {
    return errorResponse('user_id and platform are required')
  }

  if (!PLATFORM_URLS[platform]) {
    return errorResponse('Invalid platform. Must be: g2, capterra, or producthunt')
  }

  // Get user info
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, name, usage_calls_count')
    .eq('id', user_id)
    .single()

  if (userError || !user) {
    return errorResponse('User not found')
  }

  const userName = user.name || user.email.split('@')[0]
  const platformName = PLATFORM_NAMES[platform]
  const platformUrl = PLATFORM_URLS[platform]

  // Insert review request
  const { data: request, error: insertError } = await supabase
    .from('review_requests')
    .insert({
      user_id: user.id,
      user_email: user.email,
      user_name: userName,
      platform,
      status: 'pending',
      call_count_at_send: user.usage_calls_count || 0,
    })
    .select()
    .single()

  if (insertError) return errorResponse('Failed to create review request: ' + insertError.message, 500)

  // Send email via Postmark
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

  try {
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
        HtmlBody: buildEmailHtml(userName, platformName, platformUrl, user.usage_calls_count || 0),
        TextBody: buildEmailText(userName, platformName, platformUrl, user.usage_calls_count || 0),
        MessageStream: 'outbound',
      }),
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      throw new Error(`Postmark error: ${emailResult.Message || 'Unknown'}`)
    }

    // Update to sent
    await supabase
      .from('review_requests')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        postmark_message_id: emailResult.MessageID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    return successResponse({ review: { ...request, status: 'sent', postmark_message_id: emailResult.MessageID } })
  } catch (err: any) {
    // Mark as failed
    await supabase
      .from('review_requests')
      .update({
        status: 'failed',
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    return errorResponse('Email send failed: ' + err.message, 500)
  }
}

async function handleUpdateReview(supabase: any, body: any) {
  const { id, ...updates } = body
  if (!id) return errorResponse('Missing review id')

  // Remove action from updates
  delete updates.action

  // Auto-set timestamps based on status changes
  if (updates.status === 'sent' && !updates.sent_at) {
    updates.sent_at = new Date().toISOString()
  }
  if (updates.status === 'clicked' && !updates.clicked_at) {
    updates.clicked_at = new Date().toISOString()
  }
  if (updates.status === 'completed' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString()
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('review_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update review: ' + error.message, 500)
  return successResponse({ review: data })
}

async function handleDeleteReview(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('Missing review id')

  const { error } = await supabase
    .from('review_requests')
    .delete()
    .eq('id', id)

  if (error) return errorResponse('Failed to delete review: ' + error.message, 500)
  return successResponse({ deleted: true })
}

async function handleGetStats(supabase: any) {
  const { data, error } = await supabase
    .from('review_requests')
    .select('platform, status')

  if (error) return errorResponse('Failed to get stats: ' + error.message, 500)

  const stats = {
    total: data.length,
    byPlatform: { g2: 0, capterra: 0, producthunt: 0 } as Record<string, number>,
    byStatus: { pending: 0, sent: 0, clicked: 0, completed: 0, declined: 0, failed: 0 } as Record<string, number>,
    completionRate: 0,
  }

  for (const row of data) {
    if (stats.byPlatform[row.platform] !== undefined) stats.byPlatform[row.platform]++
    if (stats.byStatus[row.status] !== undefined) stats.byStatus[row.status]++
  }

  const totalSent = stats.byStatus.sent + stats.byStatus.clicked + stats.byStatus.completed + stats.byStatus.declined
  stats.completionRate = totalSent > 0 ? Math.round((stats.byStatus.completed / totalSent) * 100) : 0

  return successResponse({ stats })
}

async function handleListUsers(supabase: any) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, usage_calls_count')
    .eq('account_status', 'active')
    .order('name', { ascending: true })

  if (error) return errorResponse('Failed to list users: ' + error.message, 500)
  return successResponse({ users: data })
}

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
