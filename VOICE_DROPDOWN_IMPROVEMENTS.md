# Voice Dropdown Improvements Design

## Problem Statement

**Current Issues:**
1. Cloned voices mix with preset voices in dropdown - hard to distinguish
2. No way to preview voices before selecting
3. Using shared ElevenLabs account - all users' cloned voices stored in same account
4. Voice IDs don't indicate which user owns the cloned voice
5. Risk of users accessing each other's cloned voices

## Requirements

### 1. Separated Voice Sections
- **Cloned Voices** section (top) - user's personal voices
- **Preset Voices** section (bottom) - ElevenLabs default voices
- Clear visual separation between sections

### 2. Inline Voice Preview
- Play button next to each voice option
- Preview audio directly in dropdown (no page navigation)
- Visual feedback during playback
- Stop other previews when starting new one

### 3. Multi-User Voice Isolation
**Challenge**: Multiple users share one ElevenLabs account
- User A creates cloned voice → stored in Erik's ElevenLabs account
- User B creates cloned voice → stored in same ElevenLabs account
- Need to prevent User A from selecting User B's voice

**Solution**: Namespace cloned voices by user

## Design: Multi-User Voice Isolation

### Option 1: Voice ID Prefix (REJECTED)
**Format**: `{user_id}_{elevenlabs_voice_id}`
- Example: `abc123_kXBZvJMN8TDnxQ8gxVpZ`

**Problems:**
- ElevenLabs voice IDs are 20 chars, user UUIDs are 36 chars = 57 chars total
- Very long IDs in database and API calls
- Need to strip prefix before calling ElevenLabs API
- Confusing in logs/debugging

### Option 2: Database-Level Isolation (RECOMMENDED)
**Current schema already supports this!**

```sql
voices table:
  - id (UUID)
  - user_id (UUID) -- FK to users.id
  - voice_id (TEXT) -- ElevenLabs voice ID (unchanged)
  - voice_name (TEXT)
  - is_cloned (BOOLEAN)
```

**How it works:**
1. User A clones voice → ElevenLabs returns voice ID `kXBZvJMN8TDnxQ8gxVpZ`
2. Store in `voices` table: `user_id=user_a_uuid, voice_id=kXBZvJMN8TDnxQ8gxVpZ`
3. User B clones voice → ElevenLabs returns different voice ID `pNInz6obpgDQGcFmaJgB`
4. Store: `user_id=user_b_uuid, voice_id=pNInz6obpgDQGcFmaJgB`
5. When User A loads dropdown → query: `SELECT * FROM voices WHERE user_id = user_a_uuid`
6. RLS policies enforce: users can only see their own voices ✅

**Benefits:**
- ✅ Already implemented (RLS policies exist)
- ✅ No voice ID modification needed
- ✅ Clean ElevenLabs API calls
- ✅ Simple database queries
- ✅ Secure by design (RLS prevents data leaks)

**What we need to verify:**
- Voice cloning workflow stores `user_id` correctly
- Voice dropdown filters by logged-in user
- Agent voice selection validates user owns the voice

### Option 3: Voice Name Suffix (For User Clarity)
**Format**: Display name includes owner indicator in UI only
- Database: `voice_name = "Sarah's Voice"`
- Display: `Sarah's Voice (You)`

**Use case**: If we ever want to share voices between users (e.g., team accounts), the display name helps differentiate.

## UI Design: Voice Dropdown with Preview

### Mockup (HTML/CSS)

```html
<div class="form-group">
  <label class="form-label">Voice</label>
  <select id="voice-id" class="voice-select-with-preview">
    <optgroup label="🎤 Your Cloned Voices">
      <option value="kXBZvJMN8TDnxQ8gxVpZ" data-preview-url="/previews/user_a_voice_1.mp3">
        Sarah's Voice
      </option>
      <option value="pNInz6obpgDQGcFmaJgB" data-preview-url="/previews/user_a_voice_2.mp3">
        Professional Voice
      </option>
    </optgroup>

    <optgroup label="🔊 Preset Voices">
      <option value="21m00Tcm4TlvDq8ikWAM" data-preview-url="/previews/preset_rachel.mp3">
        Rachel (Default)
      </option>
      <option value="pNInz6obpgDQGcFmaJgB" data-preview-url="/previews/preset_adam.mp3">
        Adam
      </option>
    </optgroup>
  </select>

  <!-- Preview Controls (shown when dropdown focused) -->
  <div class="voice-preview-controls">
    <button type="button" class="btn-icon-sm voice-preview-btn" data-voice-id="selected">
      <span class="preview-icon">▶️</span>
      <span class="preview-text">Preview</span>
    </button>
    <div class="preview-progress hidden">
      <div class="preview-progress-bar"></div>
    </div>
  </div>
</div>
```

### Enhanced Dropdown with Inline Preview

**Option A: Custom Dropdown Component**
- Replace `<select>` with custom div-based dropdown
- Each option has play button icon
- Click play → preview audio
- More control, better UX

**Option B: Select + Adjacent Preview Button** (RECOMMENDED - Simpler)
- Keep native `<select>` for accessibility
- Add preview button below dropdown
- Button plays preview of currently selected voice
- Simpler implementation, works on all devices

## Implementation Plan

### Phase 1: Verify Current Voice Isolation ✅
1. Check voice cloning workflow stores `user_id`
2. Verify dropdown queries filter by `user_id`
3. Confirm RLS policies prevent cross-user access

### Phase 2: Add Voice Preview Generation
1. **Extend voice-preview-generator.js**:
   - Currently generates preview for user's selected voice
   - Extend to generate previews for ALL voices (cloned + preset)
   - Store in Supabase Storage: `voice-previews/{user_id}/{voice_id}.mp3`

2. **Add preview_url to voices table** (optional):
   ```sql
   ALTER TABLE voices ADD COLUMN preview_url TEXT;
   ```
   - Cache preview URL to avoid regeneration
   - Update when voice settings change

3. **Generate preset voice previews once**:
   - Run script to generate previews for all 29 ElevenLabs presets
   - Store in: `voice-previews/presets/{voice_id}.mp3`
   - Shared across all users (same preset voice)

### Phase 3: Update Voice Dropdown UI
1. **Add preview button**:
   ```html
   <button type="button" class="btn-preview" id="preview-voice-btn">
     <span class="icon">▶️</span> Preview Voice
   </button>
   ```

2. **Wire up preview playback**:
   ```javascript
   const previewBtn = document.getElementById('preview-voice-btn');
   const voiceSelect = document.getElementById('voice-id');

   previewBtn.addEventListener('click', async () => {
     const selectedVoiceId = voiceSelect.value;
     const selectedOption = voiceSelect.selectedOptions[0];
     const isCloned = selectedOption.parentElement.label.includes('Cloned');

     let previewUrl;
     if (isCloned) {
       // User's cloned voice preview
       previewUrl = `voice-previews/${user.id}/${selectedVoiceId}.mp3`;
     } else {
       // Preset voice preview
       previewUrl = `voice-previews/presets/${selectedVoiceId}.mp3`;
     }

     // Fetch from Supabase Storage
     const { data } = await supabase.storage
       .from('audio-files')
       .download(previewUrl);

     // Play audio
     const audio = new Audio(URL.createObjectURL(data));
     audio.play();
   });
   ```

3. **Visual feedback**:
   - Show loading spinner while fetching preview
   - Change button to "⏸️ Stop" during playback
   - Show progress bar (optional)

### Phase 4: Polish & Edge Cases
1. **Generate missing previews on-demand**:
   - If preview doesn't exist, generate it first, then play
   - Show "Generating preview..." message

2. **Update previews when voice settings change**:
   - When user updates stability/similarity, regenerate preview

3. **Cleanup old previews**:
   - When voice is deleted, delete preview file

## Database Schema Changes

### Option A: Add preview_url column (Recommended)
```sql
ALTER TABLE voices ADD COLUMN preview_url TEXT;
COMMENT ON COLUMN voices.preview_url IS 'Supabase Storage path to voice preview audio';
```

**Benefits:**
- Fast lookups (no need to construct path)
- Explicit cache invalidation (set to NULL when settings change)
- Easy to track which voices have previews

### Option B: No schema change (Use convention)
- Preview path always follows pattern: `voice-previews/{user_id}/{voice_id}.mp3`
- Check if file exists before playing
- Simpler, no migration needed

## Security Considerations

### RLS for voice-previews Storage Bucket
```sql
-- Users can only access their own voice previews
CREATE POLICY "Users access own voice previews"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1] = 'voice-previews' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Everyone can access preset voice previews
CREATE POLICY "Public access to preset previews"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1] = 'voice-previews' AND
  (storage.foldername(name))[2] = 'presets'
);
```

## Testing Plan

1. **Multi-user isolation**:
   - User A creates cloned voice
   - User B logs in
   - Verify User B doesn't see User A's voice in dropdown
   - Verify API rejects if User B tries to use User A's voice ID

2. **Voice preview playback**:
   - Click preview button → audio plays
   - Select different voice → preview updates
   - Preview works for both cloned and preset voices

3. **Preview generation**:
   - Create new cloned voice → preview auto-generates
   - Update voice settings → preview regenerates
   - Delete voice → preview file deleted

## Timeline Estimate

- Phase 1 (Verification): 30 minutes
- Phase 2 (Preview generation): 2 hours
- Phase 3 (UI updates): 2 hours
- Phase 4 (Polish): 1 hour
- **Total**: ~5-6 hours

## Open Questions

1. **Preview text**: What should the preview say?
   - Option A: "Hello, this is [voice name]. This is how I sound."
   - Option B: User's actual greeting message
   - Option C: Standard text: "Hello! Thanks for calling."

2. **Preview length**: How long should previews be?
   - Recommendation: 5-10 seconds (enough to judge voice, not too long)

3. **Auto-generate on clone?**
   - Should we automatically generate preview when voice is cloned?
   - Or generate on-demand when first requested?
