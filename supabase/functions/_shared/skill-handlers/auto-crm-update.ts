/**
 * Auto-CRM Update Skill Handler
 * Pushes extracted call data to HubSpot CRM after calls.
 * Requires HubSpot integration.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, triggerContext, isDryRun, supabaseClient, userId } = context
    const supabase = supabaseClient as ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>

    const createNote = (config.create_note as boolean) !== false
    const updateFields = (config.update_contact_fields as boolean) !== false
    const fieldMapping = (config.field_mapping as Record<string, string>) || {}
    const extractedData = (triggerContext.extracted_data as Record<string, unknown>) || {}
    const callerPhone = triggerContext.caller_phone as string
    const callerName = triggerContext.caller_name as string
    const callSummary = triggerContext.call_summary as string

    if (Object.keys(extractedData).length === 0 && !createNote) {
      return {
        summary: 'No extracted data and note creation disabled. Nothing to update.',
        actions_taken: ['skipped_no_data'],
      }
    }

    // Check HubSpot integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*, integration_providers!inner(slug)')
      .eq('user_id', userId)
      .eq('integration_providers.slug', 'hubspot')
      .eq('status', 'connected')
      .maybeSingle()

    if (!integration) {
      return {
        summary: 'HubSpot not connected. Please connect your CRM integration first.',
        actions_taken: ['skipped_no_integration'],
      }
    }

    // Build the update preview
    const mappedFields: Record<string, string> = {}
    for (const [extractedKey, crmField] of Object.entries(fieldMapping)) {
      const value = extractedData[extractedKey]
      if (value != null) {
        mappedFields[crmField] = String(value)
      }
    }

    const noteContent = callSummary
      ? `Call with ${callerName || callerPhone || 'unknown'}\n\n${callSummary}`
      : `Call with ${callerName || callerPhone || 'unknown'}`

    if (isDryRun) {
      const previewLines = []
      if (createNote) previewLines.push(`Would create CRM note: "${noteContent.substring(0, 100)}..."`)
      if (updateFields && Object.keys(mappedFields).length > 0) {
        previewLines.push(`Would update contact fields: ${JSON.stringify(mappedFields)}`)
      }
      if (previewLines.length === 0) previewLines.push('No actions would be taken (no data to sync)')

      return {
        summary: 'CRM update preview',
        actions_taken: ['preview'],
        preview: previewLines.join('\n'),
        data: { mapped_fields: mappedFields, note_preview: noteContent },
      }
    }

    const actionsTaken: string[] = []
    const accessToken = integration.access_token

    // Search for contact in HubSpot by phone
    try {
      if (callerPhone) {
        const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: 'phone',
                operator: 'CONTAINS_TOKEN',
                value: callerPhone.replace('+', ''),
              }]
            }],
            limit: 1,
          }),
        })

        const searchData = await searchResponse.json()
        const contactId = searchData?.results?.[0]?.id

        if (contactId) {
          // Update contact fields if mapped
          if (updateFields && Object.keys(mappedFields).length > 0) {
            await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ properties: mappedFields }),
            })
            actionsTaken.push('contact_fields_updated')
          }

          // Create note/engagement
          if (createNote) {
            await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                properties: {
                  hs_note_body: noteContent,
                  hs_timestamp: new Date().toISOString(),
                },
                associations: [{
                  to: { id: contactId },
                  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
                }],
              }),
            })
            actionsTaken.push('note_created')
          }
        } else {
          actionsTaken.push('contact_not_found_in_crm')
        }
      }
    } catch (err) {
      console.error('HubSpot API error:', err)
      actionsTaken.push('crm_api_error')
    }

    return {
      summary: `CRM updated: ${actionsTaken.join(', ')}`,
      actions_taken: actionsTaken,
      data: {
        mapped_fields: mappedFields,
        caller_phone: callerPhone,
      },
    }
  }
}

export default handler
