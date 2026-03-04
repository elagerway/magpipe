// Shared lazy loader for voice recognition (used by views.js and messaging.js)
let VoiceRecognition = null;
export let isVoiceSupported = () => false;

export async function loadVoiceRecognition() {
  if (!VoiceRecognition) {
    const module = await import('../../lib/voiceRecognition.js');
    VoiceRecognition = module.VoiceRecognition;
    isVoiceSupported = module.isSupported;
  }
  return { VoiceRecognition, isVoiceSupported };
}
