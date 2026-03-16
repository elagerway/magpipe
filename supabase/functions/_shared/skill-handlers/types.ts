/**
 * Shared types for the Agent Skills Framework.
 * Each skill handler implements SkillHandler.execute().
 */

export interface SkillExecutionContext {
  /** The agent_skills row with full config */
  agentSkill: {
    id: string;
    user_id: string;
    agent_id: string;
    skill_definition_id: string;
    is_enabled: boolean;
    config: Record<string, unknown>;
    trigger_type: string;
    schedule_config: Record<string, unknown>;
    event_config: Record<string, unknown>;
    delivery_channels: DeliveryChannel[];
  };
  /** The skill_definitions row */
  skillDefinition: {
    id: string;
    slug: string;
    name: string;
    handler_id: string;
    config_schema: Record<string, unknown>;
    supported_channels: string[];
    required_integrations: string[];
  };
  /** Event metadata passed by the trigger (call data, message data, etc.) */
  triggerContext: Record<string, unknown>;
  /** Resolved skill config (agentSkill.config merged with defaults from config_schema) */
  config: Record<string, unknown>;
  /** If true, return preview only — do not perform real actions */
  isDryRun: boolean;
  /** Supabase client (service role) for DB queries */
  supabaseClient: unknown;
  /** The user_id who owns this agent */
  userId: string;
}

export interface DeliveryChannel {
  channel: 'sms' | 'email' | 'slack' | 'push' | 'webhook' | 'voice_call';
  to?: 'contact' | 'user' | string;
  channel_name?: string;
  webhook_url?: string;
  /** Optional per-channel content configuration */
  content_config?: {
    fields?: string[];
    custom_text?: string;
  };
}

export interface SkillExecutionResult {
  /** Human-readable summary of what happened */
  summary: string;
  /** List of actions taken (e.g., ["sms_prepared", "crm_updated"]) */
  actions_taken: string[];
  /** For dry_run: preview text shown to user */
  preview?: string;
  /** Arbitrary data the handler wants to persist in skill_executions.result */
  data?: Record<string, unknown>;
}

export interface SkillHandler {
  execute(context: SkillExecutionContext): Promise<SkillExecutionResult>;
}
