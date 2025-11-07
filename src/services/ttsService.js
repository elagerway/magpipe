/**
 * Text-to-Speech Service
 * Converts text to speech audio using ElevenLabs via Edge Function
 */

import { supabase } from '../lib/supabase.js';

/**
 * Convert text to speech
 * @param {string} text - The text to convert to speech
 * @param {string|null} voiceId - Optional voice ID (defaults to user's agent voice)
 * @returns {Promise<Blob>} Audio blob
 */
export async function textToSpeech(text, voiceId = null) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Prepare request body
    const requestBody = {
      text: text.trim(),
    };

    if (voiceId) {
      requestBody.voice_id = voiceId;
    }

    // Call Edge Function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS error:', errorText);
      throw new Error('Failed to convert text to speech');
    }

    // Get audio blob
    const audioBlob = await response.blob();
    return audioBlob;

  } catch (error) {
    console.error('TTS service error:', error);
    throw error;
  }
}

/**
 * Play audio blob
 * @param {Blob} audioBlob - The audio blob to play
 * @returns {Promise<HTMLAudioElement>} The audio element
 */
export async function playAudio(audioBlob) {
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  return new Promise((resolve, reject) => {
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl);
      resolve(audio);
    });

    audio.addEventListener('error', (e) => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error('Audio playback failed'));
    });

    audio.play().catch(reject);
  });
}

/**
 * Convert text to speech and play it
 * @param {string} text - The text to speak
 * @param {string|null} voiceId - Optional voice ID
 * @returns {Promise<HTMLAudioElement>} The audio element
 */
export async function speak(text, voiceId = null) {
  const audioBlob = await textToSpeech(text, voiceId);
  return await playAudio(audioBlob);
}
