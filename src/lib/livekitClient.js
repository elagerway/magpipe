import { Room, RoomEvent } from 'livekit-client';
import { supabase } from './supabase.js';

class LiveKitClient {
  constructor() {
    this.room = null;
    this.isConnected = false;
  }

  async joinRoom(roomName, token) {
    if (this.room) {
      console.log('Disconnecting from existing room...');
      await this.disconnect();
    }

    console.log('Joining LiveKit room:', roomName);

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Set up event listeners
    this.room
      .on(RoomEvent.Connected, () => {
        console.log('✅ Connected to LiveKit room');
        this.isConnected = true;
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('❌ Disconnected from LiveKit room');
        this.isConnected = false;
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('🎧 Track subscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === 'audio') {
          // Attach audio track to play it
          const audioElement = track.attach();
          document.body.appendChild(audioElement);
          audioElement.play();
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        console.log('🔇 Track unsubscribed:', track.kind);
        track.detach().forEach(element => element.remove());
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Participant connected:', participant.identity);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('👋 Participant disconnected:', participant.identity);
      });

    // Connect to the room
    const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || 'wss://snapsonic-lnr00zfm.livekit.cloud';
    
    try {
      await this.room.connect(livekitUrl, token);
      console.log('🎉 Successfully joined LiveKit room!');
      
      // Enable microphone
      await this.room.localParticipant.setMicrophoneEnabled(true);
      console.log('🎤 Microphone enabled');
      
      return true;
    } catch (error) {
      console.error('Failed to connect to LiveKit room:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
      this.isConnected = false;
      console.log('Disconnected from LiveKit room');
    }
  }

  async toggleMicrophone(enabled) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      console.log('Microphone:', enabled ? 'enabled' : 'disabled');
    }
  }
}

export const livekitClient = new LiveKitClient();
