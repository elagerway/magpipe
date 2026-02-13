import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface McpExecuteResponse {
  success: boolean;
  result?: any;
  message?: string;
  pending_action?: {
    type: string;
    preview: string;
    parameters: Record<string, any>;
  };
  requires_confirmation?: boolean;
  business_info?: any;
}

export function getToolSource(toolName: string): string {
  // Check if MCP server tool (format: "server_slug:tool_name")
  if (toolName.includes(':')) {
    return `mcp:${toolName.split(':')[0]}`;
  }
  const integrationTools = ['slack_send_message', 'slack_list_channels', 'check_calendar_availability', 'book_calendar_appointment'];
  if (integrationTools.some(t => toolName.startsWith(t.split('_')[0]))) {
    return toolName.split('_')[0];
  }
  return 'builtin';
}

// Helper function to normalize phone number
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

// Helper function to find contacts by name or phone
export async function findContacts(supabase: any, userId: string, identifier: string) {
  const searchTerm = identifier.toLowerCase();
  const phoneDigits = identifier.replace(/\D/g, '');

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number')
    .eq('user_id', userId);

  return (contacts || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm) ||
    (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
  );
}
