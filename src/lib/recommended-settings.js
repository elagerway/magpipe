/**
 * Recommended agent settings keyed by (agent_type, llm_model).
 *
 * Used in two places:
 *   1. Configure tab — show "Recommended: X" hints under each input so a user
 *      who deviates can still see the platform's suggested baseline.
 *   2. Agent create flow — preset new agents to these values instead of the
 *      historical column defaults, which had drifted from what's actually fast
 *      and predictable on each model.
 *
 * Numbers are platform defaults, not laws — users can override anything. If a
 * recommendation here looks wrong for a specific model, edit this file rather
 * than duplicating overrides at every call site.
 */

const VOICE_TYPES = ['inbound_voice', 'outbound_voice'];
const TEXT_TYPES = ['text', 'email', 'chat_widget', 'whatsapp'];

// Model classes — coarse buckets that determine recommended LLM-side knobs.
function modelClass(llmModel) {
  if (!llmModel) return 'mini';
  if (llmModel.includes('mini') || llmModel.includes('haiku')) return 'mini';
  return 'full';
}

// Voice-only TTS / VAD knobs — same across models since they're TTS-side, not LLM-side.
const VOICE_BASELINE = {
  stability: 0.5,
  speed: 1.0,
  responsiveness: 1.0,
  interrupt_sensitivity: 0.6,
  backchannel_enabled: false,
  backchannel_frequency: 0.1,
  vad_silence_duration: 0,
  vad_speech_duration: 0.15,
  vad_activation_threshold: 0.6,
  ambient_sound: 'off',
  ambient_sound_volume: 0.25,
  noise_suppression: 'medium',
  idle_trigger: 2.0,
  idle_reminders: 0,
  agent_volume: 1.0,
};

// LLM-side knobs vary by (agent_type, model_class).
const LLM_RECOMMENDED = {
  voice: {
    mini: { temperature: 0.5, max_tokens: 150 },
    full: { temperature: 0.5, max_tokens: 200 },
  },
  text: {
    mini: { temperature: 0.7, max_tokens: 250 },
    full: { temperature: 0.7, max_tokens: 250 },
  },
};

/**
 * Get the full recommended settings dict for a given agent_type + llm_model.
 * Voice agents get TTS/VAD recommendations layered on top of LLM ones.
 * Text agents only get LLM recommendations.
 */
export function getRecommendedSettings(agentType, llmModel) {
  const surface = VOICE_TYPES.includes(agentType) ? 'voice' : 'text';
  const cls = modelClass(llmModel);
  const llm = LLM_RECOMMENDED[surface][cls];

  if (surface === 'voice') {
    return { ...VOICE_BASELINE, ...llm };
  }
  return { ...llm };
}

/**
 * Recommended value for one specific field. Returns undefined if the field
 * has no recommendation for this surface (e.g. asking for `stability` on a
 * text agent — that input shouldn't render at all in that case).
 */
export function getRecommendedValue(agentType, llmModel, field) {
  const all = getRecommendedSettings(agentType, llmModel);
  return all[field];
}

/**
 * Render a small inline hint: `Recommended: 0.5` (gray) when the user's
 * current value matches, or `Recommended: 0.5 (you've changed this)` (subtle
 * accent) when it differs. Caller passes the `currentValue` from the form
 * state. Returns an empty string when there's no recommendation for the
 * field on this surface — caller can append unconditionally.
 */
export function renderRecommendedHint(agentType, llmModel, field, currentValue) {
  const rec = getRecommendedValue(agentType, llmModel, field);
  if (rec === undefined) return '';
  const matches = String(currentValue) === String(rec);
  const cls = matches ? 'rec-hint rec-hint-match' : 'rec-hint rec-hint-diff';
  const suffix = matches ? '' : ' (changed)';
  return `<span class="${cls}" data-rec-field="${field}" data-rec-value="${rec}">Recommended: ${rec}${suffix}</span>`;
}

export const _internal = { VOICE_TYPES, TEXT_TYPES, modelClass };
