/**
 * Gmail Watch Renewal
 * Daily cron to renew expiring Gmail Pub/Sub watches.
 * Gmail watches expire after ~7 days — this renews any expiring within 2 days.
 * Also callable on-demand to set up initial watches.
 *
 * Deploy with: npx supabase functions deploy gmail-watch-renew
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  getValidAccessToken,
  getLatestHistoryId,
  setupGmailWatch,
} from '../_shared/gmail-helpers.ts'

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const topicName = Deno.env.get('GMAIL_PUBSUB_TOPIC')
    if (!topicName) {
      console.error('GMAIL_PUBSUB_TOPIC not set')
      return jsonResponse({ error: 'GMAIL_PUBSUB_TOPIC not configured' }, 500)
    }

    // Find configs that need watch renewal:
    // - watch_expiration is NULL (never set up)
    // - watch_expiration is within 2 days from now
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

    const { data: configs, error: configError } = await supabase
      .from('agent_email_configs')
      .select('*')
      .eq('is_active', true)
      .or(`watch_expiration.is.null,watch_expiration.lt.${twoDaysFromNow}`)

    if (configError) {
      console.error('Error fetching configs:', configError)
      return jsonResponse({ error: configError.message }, 500)
    }

    if (!configs?.length) {
      console.log('No watches need renewal')
      return jsonResponse({ success: true, renewed: 0 })
    }

    // Get google_email provider
    const { data: provider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single()

    if (!provider) {
      return jsonResponse({ error: 'google_email provider not found' }, 500)
    }

    let renewed = 0
    let failed = 0

    for (const config of configs) {
      if (!config.gmail_address) continue

      // Get integration
      let integration: any = null
      if (config.integration_id) {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('id', config.integration_id)
          .eq('status', 'connected')
          .single()
        integration = data
      } else {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', config.user_id)
          .eq('provider_id', provider.id)
          .eq('status', 'connected')
          .limit(1)
          .single()
        integration = data
      }

      if (!integration) {
        console.log(`No integration for config ${config.id}, skipping`)
        continue
      }

      const accessToken = await getValidAccessToken(supabase, integration)
      if (!accessToken) {
        console.error(`Failed to get token for config ${config.id}`)
        failed++
        continue
      }

      // Set up watch
      const watchResult = await setupGmailWatch(accessToken, topicName)
      if (!watchResult) {
        console.error(`Watch setup failed for config ${config.id}`)
        failed++
        continue
      }

      // Update config with watch info
      const updateData: Record<string, any> = {
        watch_expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
        watch_resource_id: watchResult.resourceId || null,
        updated_at: new Date().toISOString(),
      }

      // Also set last_history_id if not already set (first-time setup)
      if (!config.last_history_id) {
        const historyId = await getLatestHistoryId(accessToken)
        if (historyId) {
          updateData.last_history_id = historyId
        }
      }

      await supabase
        .from('agent_email_configs')
        .update(updateData)
        .eq('id', config.id)

      console.log(`Renewed watch for ${config.gmail_address} (config ${config.id}), expires ${updateData.watch_expiration}`)
      renewed++
    }

    return jsonResponse({
      success: true,
      total_configs: configs.length,
      renewed,
      failed,
    })

  } catch (error: any) {
    console.error('Error in gmail-watch-renew:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
