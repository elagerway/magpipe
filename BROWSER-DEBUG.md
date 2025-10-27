# Browser Debugging - What Are You Connected To?

## Check These in Browser Console

### 1. Check LiveKit Client State
Open the browser console and run:
```javascript
// Check if livekitClient exists and is connected
console.log('LiveKit Client:', livekitClient);
console.log('Is Connected:', livekitClient?.isConnected);
console.log('Room:', livekitClient?.room);
console.log('Room State:', livekitClient?.room?.state);
console.log('Room Name:', livekitClient?.room?.name);
```

### 2. Check Room Participants
```javascript
// See who's in the room with you
if (livekitClient?.room) {
  console.log('Local Participant:', livekitClient.room.localParticipant?.identity);
  console.log('Remote Participants:', livekitClient.room.remoteParticipants.size);

  livekitClient.room.remoteParticipants.forEach((participant, key) => {
    console.log('Participant:', {
      identity: participant.identity,
      sid: participant.sid,
      tracks: participant.trackPublications.size,
      audioTracks: Array.from(participant.audioTrackPublications.values()).map(p => ({
        kind: p.kind,
        muted: p.isMuted,
        subscribed: p.isSubscribed
      }))
    });
  });
}
```

### 3. Check for Audio Tracks
```javascript
// Check if you're receiving any audio
if (livekitClient?.room) {
  const audioTracks = [];
  livekitClient.room.remoteParticipants.forEach((participant) => {
    participant.audioTrackPublications.forEach((publication) => {
      audioTracks.push({
        participant: participant.identity,
        trackSid: publication.trackSid,
        subscribed: publication.isSubscribed,
        muted: publication.isMuted,
        enabled: publication.track?.isEnabled
      });
    });
  });
  console.log('Remote Audio Tracks:', audioTracks);
}
```

### 4. Check Connection State
```javascript
// Detailed connection state
if (livekitClient?.room) {
  console.log({
    connectionState: livekitClient.room.state,
    numParticipants: livekitClient.room.numParticipants,
    serverUrl: livekitClient.room.url,
    sid: livekitClient.room.sid,
    name: livekitClient.room.name
  });
}
```

## What You're Looking For

### If you see ONLY yourself:
- `Remote Participants: 0`
- This means the SIP participant never joined
- LiveKit created the room but failed to connect to SignalWire

### If you see a SIP participant:
- `Remote Participants: 1` or more
- Identity might be something like `sip-outbound-{id}`
- Check if it has audio tracks
- Check if tracks are muted or not subscribed

### If disconnected:
- `Is Connected: false`
- `Room State: disconnected`
- This means the browser lost connection to LiveKit

## Next Steps Based on Results

### Scenario 1: You're alone in the room
**Problem:** LiveKit SIP client failed to connect to SignalWire
**Solution:** Need to configure SignalWire to accept incoming SIP from LiveKit

### Scenario 2: SIP participant exists but no audio
**Problem:** SIP connected but no audio routing
**Solution:** Check if SignalWire is bridging the call to PSTN

### Scenario 3: Disconnected
**Problem:** Browser lost connection
**Solution:** Check network, LiveKit credentials, or room timeout settings
