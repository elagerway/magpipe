# Maggie AI - LiveKit Voice Agent

Python-based LiveKit agent for handling real-time voice conversations with custom voice support.

## Features

- ✅ Real-time speech-to-text (Deepgram Nova-2)
- ✅ LLM conversation (OpenAI GPT-4o-mini)
- ✅ Text-to-speech with custom/cloned voices (ElevenLabs)
- ✅ Function calling (call transfer via SignalWire, dynamic data collection)
- ✅ Voice cloning during conversation (ElevenLabs API integration)
- ✅ Dynamic user configuration from Supabase
- ✅ Custom voice settings per user

## Prerequisites

1. **LiveKit Cloud Account** (already configured)
2. **Deepgram API Key** - Get from https://console.deepgram.com/
3. **OpenAI API Key** - Already have
4. **ElevenLabs API Key** - Already have
5. **Render Account** - For deployment

## Local Development

### 1. Install Dependencies

```bash
cd agents/livekit-voice-agent
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual keys.

### 3. Run Agent Locally

```bash
# Fix macOS SSL certificates first
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")

python agent.py dev
```

This starts the agent in development mode, connecting to your LiveKit Cloud.

### 4. Local Testing with Dedicated Number (Recommended)

To avoid conflicts with the production Render agent:

1. **LiveKit Cloud Dashboard**: Create a dispatch rule for test number (+16042101966) that routes to agent name "SW Telephony Agent Local"

2. **Run local agent with different name**:
```bash
export LIVEKIT_AGENT_NAME="SW Telephony Agent Local"
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
python agent.py dev
```

3. **Assign test number to an agent** in the database (service_numbers table)

4. **Call the test number** to test your changes locally before deploying

## Deployment on Render

### Option 1: Deploy via Render Dashboard

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `agents/livekit-voice-agent` directory as the root
5. Configure:
   - **Name**: `magpipe-livekit-agent`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python agent.py start`
   - **Plan**: Starter ($7/month) or higher

6. Add Environment Variables (from Render dashboard):
   ```
   LIVEKIT_URL=wss://plug-bq7kgzpt.livekit.cloud
   LIVEKIT_API_KEY=your-livekit-api-key
   LIVEKIT_API_SECRET=your-livekit-api-secret
   SUPABASE_URL=<your_supabase_url>
   SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
   SIGNALWIRE_SPACE=<your_space>.signalwire.com
   SIGNALWIRE_PROJECT_ID=<your_project_id>
   SIGNALWIRE_API_TOKEN=<your_api_token>
   OPENAI_API_KEY=<your_openai_key>
   DEEPGRAM_API_KEY=<get_from_deepgram>
   ELEVENLABS_API_KEY=<your_elevenlabs_key>
   ```

7. Click "Create Web Service"

### Option 2: Deploy via Blueprint (render.yaml)

1. In Render dashboard, click "New +" → "Blueprint"
2. Connect repository and select `agents/livekit-voice-agent/render.yaml`
3. Fill in environment variables when prompted
4. Deploy

## Required API Keys

### Deepgram (STT)

1. Sign up at https://console.deepgram.com/
2. Create a new project
3. Generate API key
4. Free tier includes $200 credits

### Already Have

- OpenAI API Key ✅
- ElevenLabs API Key ✅
- LiveKit credentials ✅
- Supabase credentials ✅

## Testing

Once deployed, the agent will:

1. Listen for LiveKit room connections
2. Load user configuration from Supabase
3. Start voice pipeline when participant joins
4. Handle real-time conversation with:
   - Speech recognition (Deepgram)
   - LLM responses (OpenAI GPT-4o-mini)
   - Voice synthesis with custom/cloned voices (ElevenLabs)
   - Function calling:
     - Call transfer via SignalWire
     - Dynamic data collection (email, phone, name, etc.)
     - Voice cloning from audio samples

## Architecture

```
Incoming Call (SignalWire)
  ↓
webhook-inbound-call (checks active_voice_stack = 'livekit')
  ↓
Create LiveKit Room + SIP Connection
  ↓
LiveKit Agent (on Render)
  ↓
Pipeline: Deepgram STT → OpenAI LLM → ElevenLabs TTS
  ↓
Real-time voice conversation
```

## Monitoring

- **Render Logs**: View at https://dashboard.render.com/ → Your Service → Logs
- **LiveKit Dashboard**: https://cloud.livekit.io/projects
- **Supabase Logs**: Edge function logs for room creation

## Troubleshooting

### Agent not connecting to rooms

- Check LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are correct
- Verify Render service is running (not sleeping)
- Check Render logs for errors

### No audio in calls

- Verify Deepgram API key is valid and has credits
- Check ElevenLabs API key is valid
- Ensure voice_id exists in ElevenLabs account

### Transfer function not working

- Verify transfer_numbers table has records for user
- Check Supabase connection (SUPABASE_URL, SERVICE_ROLE_KEY)

## Cost Estimate

- **Render**: $7/month (Starter plan)
- **LiveKit**: ~$0.02/min
- **Deepgram**: ~$0.0043/min
- **OpenAI GPT-4o-mini**: ~$0.005/min
- **ElevenLabs**: ~$0.01/min

**Total**: ~$0.04/min + $7/month base

Compare to Retell: $0.09/min (56% savings!)

## Next Steps

After deployment:

1. Get Deepgram API key
2. Deploy to Render
3. Configure LiveKit SIP trunk to point to SignalWire
4. Update user's `active_voice_stack` to 'livekit' in database
5. Test with a call!
# Auto-deploy trigger Fri Oct  3 16:44:30 PDT 2025
