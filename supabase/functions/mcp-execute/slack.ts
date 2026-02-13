import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { McpExecuteResponse } from './utils.ts'

export async function handleIntegrationTool(supabase: any, userId: string, toolName: string, args: any): Promise<McpExecuteResponse> {
  // Get user's integration for this tool
  const providerSlug = toolName.split('_')[0];  // e.g., 'slack' from 'slack_send_message'

  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select(`
      id,
      access_token,
      refresh_token,
      token_expires_at,
      external_workspace_id,
      integration_providers!inner(id, slug, oauth_config)
    `)
    .eq('user_id', userId)
    .eq('integration_providers.slug', providerSlug)
    .eq('status', 'connected')
    .single();

  if (integrationError || !integration) {
    return {
      success: false,
      message: `${providerSlug} is not connected. Would you like me to help you connect it? Just say "connect ${providerSlug}".`,
    };
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  const tokenExpiry = new Date(integration.token_expires_at);
  const refreshThreshold = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry < refreshThreshold && integration.refresh_token) {
    const refreshResult = await refreshSlackToken(supabase, integration);
    if (!refreshResult.success) {
      return {
        success: false,
        message: `Your ${providerSlug} connection has expired. Please reconnect it in Settings.`,
      };
    }
    integration.access_token = refreshResult.access_token;
  }

  // Route to specific handler based on tool
  switch (toolName) {
    case 'slack_send_message':
      return await handleSlackSendMessage(integration.access_token, args);

    case 'slack_list_channels':
      return await handleSlackListChannels(integration.access_token);

    default:
      return {
        success: false,
        message: `Tool ${toolName} is not yet implemented.`,
      };
  }
}

export async function refreshSlackToken(supabase: any, integration: any): Promise<{ success: boolean; access_token?: string }> {
  const clientId = Deno.env.get('SLACK_CLIENT_ID');
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('Slack credentials not configured');
    return { success: false };
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack token refresh failed:', result.error);
      return { success: false };
    }

    // Update stored tokens
    const expiresAt = new Date(Date.now() + (result.expires_in || 43200) * 1000);

    await supabase
      .from('user_integrations')
      .update({
        access_token: result.access_token,
        refresh_token: result.refresh_token || integration.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return { success: true, access_token: result.access_token };

  } catch (error) {
    console.error('Slack token refresh error:', error);
    return { success: false };
  }
}

export async function handleSlackSendMessage(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { channel, message } = args;

  if (!channel || !message) {
    return {
      success: false,
      message: 'Please specify both a channel and a message.',
    };
  }

  // Resolve channel name to ID if needed
  let channelId = channel;

  // If channel starts with #, look it up
  if (channel.startsWith('#')) {
    const channelName = channel.slice(1).toLowerCase();
    const channelsResult = await handleSlackListChannels(accessToken);

    if (channelsResult.success && channelsResult.result?.channels) {
      const foundChannel = channelsResult.result.channels.find(
        (c: any) => c.name.toLowerCase() === channelName
      );

      if (foundChannel) {
        channelId = foundChannel.id;
      } else {
        return {
          success: false,
          message: `I couldn't find a channel called "${channel}". Try "list Slack channels" to see available channels.`,
        };
      }
    }
  }

  try {
    // First, try to join the channel (auto-join for public channels)
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    });
    // Ignore join result - it's ok if already joined or if it's a DM

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      // Handle common errors
      if (result.error === 'channel_not_found') {
        return {
          success: false,
          message: `I couldn't find that channel. Make sure the channel exists and I have access to it.`,
        };
      }
      if (result.error === 'not_in_channel') {
        return {
          success: false,
          message: `I couldn't join that channel. It may be private - ask a channel admin to invite the Maggie app.`,
        };
      }

      return {
        success: false,
        message: `Failed to send message: ${result.error}`,
      };
    }

    return {
      success: true,
      message: `Message sent to ${channel}!`,
      result: {
        channel: result.channel,
        timestamp: result.ts,
      },
    };

  } catch (error) {
    console.error('Slack send message error:', error);
    return {
      success: false,
      message: 'Failed to send message to Slack. Please try again.',
    };
  }
}

export async function handleSlackListChannels(accessToken: string): Promise<McpExecuteResponse> {
  try {
    const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to list channels: ${result.error}`,
      };
    }

    const channels = (result.channels || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
      num_members: c.num_members,
    }));

    if (channels.length === 0) {
      return {
        success: true,
        message: "I don't see any channels. Make sure the Maggie app has been added to your Slack workspace.",
        result: { channels: [] },
      };
    }

    // Build a nice message
    const publicChannels = channels.filter((c: any) => !c.is_private);
    const privateChannels = channels.filter((c: any) => c.is_private);

    let message = `Here are your Slack channels:\n\n`;

    if (publicChannels.length > 0) {
      message += `Public channels:\n${publicChannels.slice(0, 10).map((c: any) => `• #${c.name}`).join('\n')}`;
      if (publicChannels.length > 10) {
        message += `\n...and ${publicChannels.length - 10} more`;
      }
    }

    if (privateChannels.length > 0) {
      message += `\n\nPrivate channels:\n${privateChannels.slice(0, 5).map((c: any) => `• 🔒 ${c.name}`).join('\n')}`;
      if (privateChannels.length > 5) {
        message += `\n...and ${privateChannels.length - 5} more`;
      }
    }

    message += '\n\nYou can say "send a message to #channel-name" to post a message.';

    return {
      success: true,
      message,
      result: { channels },
    };

  } catch (error) {
    console.error('Slack list channels error:', error);
    return {
      success: false,
      message: 'Failed to list Slack channels. Please try again.',
    };
  }
}
