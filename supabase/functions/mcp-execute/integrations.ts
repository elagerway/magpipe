import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { McpExecuteResponse } from './utils.ts'

export async function handleListAvailableIntegrations(supabase: any, userId: string): Promise<McpExecuteResponse> {
  // Get all enabled integration providers
  const { data: providers, error: providersError } = await supabase
    .from('integration_providers')
    .select('id, slug, name, description, category')
    .eq('enabled', true)
    .neq('slug', 'builtin')
    .order('name');

  if (providersError) {
    return { success: false, message: 'Failed to fetch integrations' };
  }

  // Get user's connected integrations
  const { data: userIntegrations } = await supabase
    .from('user_integrations')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('status', 'connected');

  const connectedProviderIds = new Set((userIntegrations || []).map((ui: any) => ui.provider_id));

  // Also check legacy Cal.com connection
  const { data: userData } = await supabase
    .from('users')
    .select('cal_com_access_token')
    .eq('id', userId)
    .single();

  const hasLegacyCalCom = !!userData?.cal_com_access_token;

  // Categorize providers
  const connected: any[] = [];
  const available: any[] = [];

  for (const provider of providers || []) {
    const isConnected = connectedProviderIds.has(provider.id) ||
      (provider.slug === 'cal_com' && hasLegacyCalCom);

    const info = {
      slug: provider.slug,
      name: provider.name,
      description: provider.description,
      category: provider.category,
    };

    if (isConnected) {
      connected.push(info);
    } else {
      available.push(info);
    }
  }

  // Build natural language response
  let message = '';

  if (connected.length > 0) {
    message += `You have ${connected.length} connected integration${connected.length > 1 ? 's' : ''}: ${connected.map(c => c.name).join(', ')}.\n\n`;
  } else {
    message += "You don't have any integrations connected yet.\n\n";
  }

  if (available.length > 0) {
    message += `Available to connect: ${available.map(a => a.name).join(', ')}.\n\n`;
    message += 'Would you like me to help you connect any of these?';
  } else {
    message += 'All available integrations are already connected!';
  }

  return {
    success: true,
    message,
    result: {
      connected,
      available,
    },
  };
}

export async function handleStartIntegrationConnection(supabase: any, userId: string, jwt: string, args: any): Promise<McpExecuteResponse> {
  const { provider } = args;

  if (!provider) {
    return { success: false, message: 'Please specify which integration you want to connect.' };
  }

  // Check if provider exists and is enabled
  const { data: providerData } = await supabase
    .from('integration_providers')
    .select('id, slug, name')
    .eq('slug', provider)
    .eq('enabled', true)
    .single();

  if (!providerData) {
    return {
      success: false,
      message: `I couldn't find an integration called "${provider}". Try saying "list integrations" to see what's available.`,
    };
  }

  // Check if already connected
  const { data: existingConnection } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider_id', providerData.id)
    .eq('status', 'connected')
    .single();

  // Also check legacy Cal.com
  if (provider === 'cal_com') {
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', userId)
      .single();

    if (userData?.cal_com_access_token) {
      return {
        success: false,
        message: `${providerData.name} is already connected! You can use it right away.`,
      };
    }
  }

  if (existingConnection) {
    return {
      success: false,
      message: `${providerData.name} is already connected! You can use it right away.`,
    };
  }

  // Call integration-oauth-start to get OAuth URL
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/integration-oauth-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ provider }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return {
      success: false,
      message: result.error || `Failed to start ${providerData.name} connection. Please try again from Settings.`,
    };
  }

  // Return the OAuth URL for the user to click
  return {
    success: true,
    message: `To connect ${providerData.name}, please tap the link below to authorize access:\n\n[Connect ${providerData.name}](${result.url})\n\nAfter authorizing, you'll be returned here and I'll confirm the connection.`,
    result: {
      provider: provider,
      oauth_url: result.url,
    },
  };
}

export async function handleCheckIntegrationStatus(supabase: any, userId: string, args: any): Promise<McpExecuteResponse> {
  const { provider } = args;

  if (!provider) {
    return { success: false, message: 'Please specify which integration to check.' };
  }

  // Get provider info
  const { data: providerData } = await supabase
    .from('integration_providers')
    .select('id, slug, name')
    .eq('slug', provider)
    .single();

  if (!providerData) {
    return {
      success: false,
      message: `I couldn't find an integration called "${provider}".`,
    };
  }

  // Check user_integrations
  const { data: connection } = await supabase
    .from('user_integrations')
    .select('status, connected_at')
    .eq('user_id', userId)
    .eq('provider_id', providerData.id)
    .single();

  // Also check legacy Cal.com
  if (provider === 'cal_com') {
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', userId)
      .single();

    if (userData?.cal_com_access_token) {
      return {
        success: true,
        message: `${providerData.name} is connected and ready to use!`,
        result: {
          provider: provider,
          connected: true,
          status: 'connected',
        },
      };
    }
  }

  if (connection?.status === 'connected') {
    const connectedDate = new Date(connection.connected_at).toLocaleDateString();
    return {
      success: true,
      message: `${providerData.name} is connected (since ${connectedDate}) and ready to use!`,
      result: {
        provider: provider,
        connected: true,
        status: connection.status,
        connected_at: connection.connected_at,
      },
    };
  }

  return {
    success: true,
    message: `${providerData.name} is not connected. Would you like me to help you connect it?`,
    result: {
      provider: provider,
      connected: false,
      status: connection?.status || 'not_connected',
    },
  };
}
