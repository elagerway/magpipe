# Retell Stack Archive

This directory contains archived code and documentation for the Retell AI integration.

**Archived Date:** 2025-10-25
**Reason:** Moved to LiveKit-only architecture
**Status:** Preserved for potential future re-introduction

## Contents

### Edge Functions (7)
- `configure-retell-webhook/` - Webhook configuration
- `create-retell-agent/` - Agent creation
- `deactivate-phone-in-retell/` - Phone deactivation
- `register-phone-with-retell/` - Phone registration
- `retell-llm-websocket/` - LLM WebSocket handler
- `update-retell-agent/` - Agent updates
- `update-retell-transfer-tool/` - Transfer tool updates

### Documentation
- `VOICE_AI_MULTI_PROVIDER_ARCHITECTURE.md` - Multi-provider architecture spec
- `voice-ai-stack-switching.md` - Stack switching feature spec

## Note

The `webhook-retellai-analysis` function was **NOT** archived as it may still be handling
legacy call completions. Check active usage before archiving.

## Restoration

To restore Retell integration:
1. Move Edge Functions back to `supabase/functions/`
2. Deploy functions: `supabase functions deploy <function-name>`
3. Update database: Set `active_voice_stack = 'retell'` for affected users
4. Restore documentation to appropriate locations
