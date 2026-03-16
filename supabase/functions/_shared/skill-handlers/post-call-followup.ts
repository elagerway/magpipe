/**
 * Post-Call Follow-Up Skill Handler
 * Sends a follow-up SMS or email to callers after a call ends.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'
import { resolveTemplate, buildVariables } from './template.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, triggerContext, isDryRun } = context

    const messageTemplate = (config.message_template as string) || 'Hi {{caller_name}}, thank you for your call.'
    const minDuration = (config.min_call_duration_seconds as number) || 10
    const consentConfirmed = config.consent_confirmed as boolean

    // Validate minimum call duration
    const callDuration = (triggerContext.call_duration_seconds as number) || 0
    if (callDuration < minDuration && !isDryRun) {
      return {
        summary: `Call too short (${callDuration}s < ${minDuration}s minimum). Skipped.`,
        actions_taken: ['skipped_short_call'],
      }
    }

    // Validate consent
    if (!consentConfirmed && !isDryRun) {
      return {
        summary: 'Consent not confirmed. Follow-up message not sent.',
        actions_taken: ['skipped_no_consent'],
      }
    }

    // Build variables and resolve template
    const variables = buildVariables(triggerContext, config)
    const resolvedMessage = resolveTemplate(messageTemplate, variables)

    if (isDryRun) {
      return {
        summary: 'Follow-up message preview',
        actions_taken: ['preview'],
        preview: resolvedMessage,
        data: {
          template: messageTemplate,
          resolved: resolvedMessage,
          variables_used: Object.keys(variables),
          caller_phone: triggerContext.caller_phone,
        },
      }
    }

    return {
      summary: resolvedMessage,
      actions_taken: ['message_prepared'],
      data: {
        message: resolvedMessage,
        caller_phone: triggerContext.caller_phone,
        caller_name: triggerContext.caller_name,
      },
    }
  }
}

export default handler
