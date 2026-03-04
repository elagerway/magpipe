import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { McpExecuteResponse } from './utils.ts'

/**
 * Handle HubSpot integration tools
 */
export async function handleHubSpotTool(
  supabase: any,
  userId: string,
  toolName: string,
  args: any
): Promise<McpExecuteResponse> {
  // Get user's HubSpot integration
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
    .eq('integration_providers.slug', 'hubspot')
    .eq('status', 'connected')
    .single();

  if (integrationError || !integration) {
    return {
      success: false,
      message: 'HubSpot is not connected. Please connect HubSpot in Settings → Apps.',
    };
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  const tokenExpiry = new Date(integration.token_expires_at);
  const refreshThreshold = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry < refreshThreshold && integration.refresh_token) {
    const refreshResult = await refreshHubSpotToken(supabase, integration);
    if (!refreshResult.success) {
      return {
        success: false,
        message: 'Your HubSpot connection has expired. Please reconnect it in Settings.',
      };
    }
    integration.access_token = refreshResult.access_token;
  }

  // Route to specific handler
  switch (toolName) {
    case 'hubspot_create_contact':
      return await handleHubSpotCreateContact(integration.access_token, args);

    case 'hubspot_search_contacts':
      return await handleHubSpotSearchContacts(integration.access_token, args);

    case 'hubspot_get_contact':
      return await handleHubSpotGetContact(integration.access_token, args);

    case 'hubspot_create_note':
      return await handleHubSpotCreateNote(integration.access_token, args);

    default:
      return {
        success: false,
        message: `HubSpot tool ${toolName} is not yet implemented.`,
      };
  }
}

export async function refreshHubSpotToken(supabase: any, integration: any): Promise<{ success: boolean; access_token?: string }> {
  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID');
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('HubSpot credentials not configured');
    return { success: false };
  }

  try {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('HubSpot token refresh failed:', result);
      return { success: false };
    }

    // Update stored tokens
    const expiresAt = new Date(Date.now() + (result.expires_in || 21600) * 1000);

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
    console.error('HubSpot token refresh error:', error);
    return { success: false };
  }
}

export async function handleHubSpotCreateContact(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email, firstname, lastname, phone } = args;

  if (!email) {
    return {
      success: false,
      message: 'Email is required to create a HubSpot contact.',
    };
  }

  // First, search if contact already exists
  const existingContact = await searchHubSpotContactByEmail(accessToken, email);

  const properties: Record<string, string> = { email };
  if (firstname) properties.firstname = firstname;
  if (lastname) properties.lastname = lastname;
  if (phone) properties.phone = phone;

  try {
    let response;
    let result;

    if (existingContact) {
      // Update existing contact
      response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingContact.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });

      result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: `Failed to update HubSpot contact: ${result.message || 'Unknown error'}`,
        };
      }

      return {
        success: true,
        message: `Updated contact ${email} in HubSpot.`,
        result: {
          contact_id: result.id,
          email: result.properties?.email,
          updated: true,
        },
      };
    } else {
      // Create new contact
      response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });

      result = await response.json();

      if (!response.ok) {
        // Handle duplicate contact error
        if (result.category === 'CONFLICT') {
          return {
            success: false,
            message: `A contact with email ${email} already exists in HubSpot.`,
          };
        }
        return {
          success: false,
          message: `Failed to create HubSpot contact: ${result.message || 'Unknown error'}`,
        };
      }

      return {
        success: true,
        message: `Created contact ${email} in HubSpot.`,
        result: {
          contact_id: result.id,
          email: result.properties?.email,
          created: true,
        },
      };
    }
  } catch (error) {
    console.error('HubSpot create contact error:', error);
    return {
      success: false,
      message: 'Failed to create contact in HubSpot. Please try again.',
    };
  }
}

export async function searchHubSpotContactByEmail(accessToken: string, email: string): Promise<any | null> {
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email,
          }],
        }],
        properties: ['email', 'firstname', 'lastname', 'phone'],
        limit: 1,
      }),
    });

    const result = await response.json();

    if (response.ok && result.results && result.results.length > 0) {
      return result.results[0];
    }

    return null;
  } catch (error) {
    console.error('HubSpot search error:', error);
    return null;
  }
}

export async function handleHubSpotSearchContacts(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { query } = args;

  if (!query) {
    return {
      success: false,
      message: 'Please provide a search query.',
    };
  }

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 10,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to search HubSpot: ${result.message || 'Unknown error'}`,
      };
    }

    const contacts = (result.results || []).map((c: any) => ({
      id: c.id,
      email: c.properties?.email,
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || 'Unknown',
      phone: c.properties?.phone,
      company: c.properties?.company,
    }));

    if (contacts.length === 0) {
      return {
        success: true,
        message: `No contacts found matching "${query}" in HubSpot.`,
        result: { contacts: [] },
      };
    }

    const contactList = contacts.map((c: any) =>
      `• ${c.name} (${c.email})${c.phone ? ` - ${c.phone}` : ''}`
    ).join('\n');

    return {
      success: true,
      message: `Found ${contacts.length} contact(s) in HubSpot:\n${contactList}`,
      result: { contacts },
    };

  } catch (error) {
    console.error('HubSpot search error:', error);
    return {
      success: false,
      message: 'Failed to search HubSpot. Please try again.',
    };
  }
}

export async function handleHubSpotGetContact(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email } = args;

  if (!email) {
    return {
      success: false,
      message: 'Please provide an email address.',
    };
  }

  const contact = await searchHubSpotContactByEmail(accessToken, email);

  if (!contact) {
    return {
      success: true,
      message: `No contact found with email ${email} in HubSpot.`,
      result: { found: false },
    };
  }

  const name = [contact.properties?.firstname, contact.properties?.lastname].filter(Boolean).join(' ') || 'Unknown';

  return {
    success: true,
    message: `Found contact: ${name} (${contact.properties?.email})${contact.properties?.phone ? ` - ${contact.properties?.phone}` : ''}`,
    result: {
      found: true,
      contact: {
        id: contact.id,
        email: contact.properties?.email,
        firstname: contact.properties?.firstname,
        lastname: contact.properties?.lastname,
        phone: contact.properties?.phone,
      },
    },
  };
}

export async function handleHubSpotCreateNote(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email, content, subject } = args;

  if (!email) {
    return {
      success: false,
      message: 'Email is required to create a note for a HubSpot contact.',
    };
  }

  if (!content) {
    return {
      success: false,
      message: 'Note content is required.',
    };
  }

  try {
    // First find the contact by email
    const contact = await searchHubSpotContactByEmail(accessToken, email);

    if (!contact) {
      return {
        success: false,
        message: `No contact found with email ${email} in HubSpot. Create the contact first.`,
      };
    }

    // Create the note with association to the contact
    // Using the Notes API: https://developers.hubspot.com/docs/api/crm/notes
    const noteBody = subject ? `**${subject}**\n\n${content}` : content;

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [{
          to: { id: contact.id },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 202, // Note to Contact association
          }],
        }],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('HubSpot create note error:', result);
      return {
        success: false,
        message: `Failed to create note in HubSpot: ${result.message || JSON.stringify(result)}`,
      };
    }

    // Create a Communication record to update "Last Contacted" field
    // Using HubSpot's Communications API with SMS channel type
    try {
      const commResponse = await fetch('https://api.hubapi.com/crm/v3/objects/communications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_communication_channel_type: 'SMS',
            hs_communication_logged_from: 'CRM',
            hs_communication_body: noteBody,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: contact.id },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 81, // Communication to Contact
            }],
          }],
        }),
      });
      if (!commResponse.ok) {
        const commError = await commResponse.json();
        console.warn('Failed to create SMS communication:', commError);
      }
    } catch (commError) {
      console.warn('Failed to create SMS communication:', commError);
    }

    const contactName = [contact.properties?.firstname, contact.properties?.lastname].filter(Boolean).join(' ') || email;

    return {
      success: true,
      message: `Created note for ${contactName} in HubSpot.`,
      result: {
        note_id: result.id,
        contact_id: contact.id,
        contact_email: email,
      },
    };

  } catch (error) {
    console.error('HubSpot create note error:', error);
    return {
      success: false,
      message: 'Failed to create note in HubSpot. Please try again.',
    };
  }
}
