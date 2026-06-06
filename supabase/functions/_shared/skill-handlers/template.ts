/**
 * Template interpolation for skill message templates.
 * Uses {{variable_name}} syntax. Missing variables resolve to empty string.
 */

/**
 * Replace {{variable_name}} placeholders with values from the variables map.
 * Missing variables are replaced with an empty string (no error).
 */
export function resolveTemplate(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] ?? '';
  });
}

/**
 * Build the variables map from trigger context, agent config, and extracted data.
 * Merges all sources into a flat key-value map for template resolution.
 */
export function buildVariables(
  triggerContext: Record<string, unknown>,
  agentConfig?: Record<string, unknown>
): Record<string, string> {
  const vars: Record<string, string> = {};

  // Call / event metadata
  if (triggerContext.caller_phone) vars.caller_phone = String(triggerContext.caller_phone);
  if (triggerContext.caller_name) vars.caller_name = String(triggerContext.caller_name);
  if (triggerContext.call_duration_seconds) vars.call_duration = String(triggerContext.call_duration_seconds);
  if (triggerContext.call_summary) vars.call_summary = String(triggerContext.call_summary);
  if (triggerContext.contact_name) vars.contact_name = String(triggerContext.contact_name);
  if (triggerContext.contact_phone) vars.contact_phone = String(triggerContext.contact_phone);
  if (triggerContext.contact_email) vars.contact_email = String(triggerContext.contact_email);

  // Agent / organization metadata
  if (agentConfig?.name) vars.agent_name = String(agentConfig.name);
  if (agentConfig?.organization_name) vars.organization_name = String(agentConfig.organization_name);
  if (agentConfig?.owner_name) vars.owner_name = String(agentConfig.owner_name);

  // Extracted data (dynamic variables) — flatten into vars
  const extracted = triggerContext.extracted_data as Record<string, unknown> | undefined;
  if (extracted && typeof extracted === 'object') {
    for (const [key, value] of Object.entries(extracted)) {
      if (value != null) vars[key] = String(value);
    }
  }

  // Skill-specific custom message (from skill config)
  if (agentConfig?.custom_message) vars.custom_message = String(agentConfig.custom_message);

  return vars;
}
