import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { normalizePhoneNumber, findContacts, McpExecuteResponse } from './utils.ts'

export async function handleListContacts(supabase: any, userId: string, args: any): Promise<McpExecuteResponse> {
  const { search_term } = args;

  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, phone_number, notes, contact_type')
    .eq('user_id', userId)
    .order('name');

  let filtered = contacts || [];
  if (search_term) {
    const term = search_term.toLowerCase();
    filtered = filtered.filter((c: any) =>
      c.name?.toLowerCase().includes(term) ||
      c.phone_number?.includes(search_term)
    );
  }

  if (filtered.length === 0) {
    return {
      success: true,
      message: search_term
        ? `No contacts found matching "${search_term}".`
        : "You don't have any contacts yet. Would you like to add one?",
      result: { contacts: [] },
    };
  }

  const contactList = filtered.slice(0, 10).map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  const moreText = filtered.length > 10 ? `\n\n...and ${filtered.length - 10} more` : '';

  return {
    success: true,
    message: `Here are your contacts:\n${contactList}${moreText}`,
    result: { contacts: filtered.slice(0, 20) },
  };
}

export async function handleAddContact(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { name, phone_number, notes } = args;
  const normalizedPhone = normalizePhoneNumber(phone_number);

  // Check for duplicates
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('phone_number', normalizedPhone)
    .single();

  if (existing) {
    return {
      success: false,
      message: `A contact with that phone number already exists: ${existing.name}. Would you like to update their information instead?`,
    };
  }

  if (mode === 'preview') {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'add_contact',
        preview: `Add contact: ${name} (${normalizedPhone})${notes ? ` - ${notes}` : ''}`,
        parameters: { name, phone_number: normalizedPhone, notes },
      },
    };
  }

  // Execute mode - actually add the contact
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      name,
      phone_number: normalizedPhone,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: `Failed to add contact: ${error.message}` };
  }

  return {
    success: true,
    message: `Added ${name} to your contacts.`,
    result: newContact,
  };
}

export async function handleCallContact(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { contact_identifier, caller_id, purpose, goal } = args;
  const matches = await findContacts(supabase, userId, contact_identifier);
  const phoneDigits = contact_identifier.replace(/\D/g, '');

  const buildPreview = (name: string, phone: string) => {
    let preview = `Call ${name} at ${phone}?`;
    if (purpose || goal) {
      preview += '\n';
      if (purpose) preview += `\nPurpose: ${purpose}`;
      if (goal) preview += `\nGoal: ${goal}`;
    }
    return preview;
  };

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const formattedNumber = normalizePhoneNumber(contact_identifier);
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'call_contact',
          preview: buildPreview(contact_identifier, formattedNumber),
          parameters: {
            phone_number: formattedNumber,
            name: contact_identifier,
            caller_id,
            purpose: purpose || null,
            goal: goal || null,
          },
        },
      };
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${contact_identifier}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'call_contact',
        preview: buildPreview(matches[0].name, matches[0].phone_number),
        parameters: {
          contact_id: matches[0].id,
          phone_number: matches[0].phone_number,
          name: matches[0].name,
          caller_id,
          purpose: purpose || null,
          goal: goal || null,
        },
      },
    };
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${contact_identifier}":\n${contactList}\n\nPlease be more specific about who you'd like to call.`,
  };
}
