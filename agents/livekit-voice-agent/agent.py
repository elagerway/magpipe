"""
Pat AI Voice Agent - LiveKit Implementation
Handles real-time voice conversations with STT, LLM, and TTS pipeline
"""

import asyncio
import logging
import os
from typing import Annotated

from livekit import rtc, api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
    AgentSession,
    Agent,
    function_tool,
)
from livekit.plugins import deepgram, openai as lkopenai, elevenlabs, silero

from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# LiveKit API credentials (client initialized in entrypoint where event loop exists)
livekit_url = os.getenv("LIVEKIT_URL")
livekit_api_key = os.getenv("LIVEKIT_API_KEY")
livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")


async def get_user_config(room_metadata: dict) -> dict:
    """Fetch user's agent configuration from Supabase"""
    user_id = room_metadata.get("user_id")

    if not user_id:
        logger.error("No user_id in room metadata")
        return None

    try:
        response = supabase.table("agent_configs") \
            .select("*") \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()

        if response.data and len(response.data) > 0:
            return response.data[0]
        else:
            logger.warning(f"No agent_config found for user_id: {user_id}")
            return None
    except Exception as e:
        logger.error(f"Failed to fetch user config: {e}")
        return None


async def get_voice_config(voice_id: str, user_id: str) -> dict:
    """Fetch voice configuration from database"""
    try:
        # Remove '11labs-' prefix if present
        clean_voice_id = voice_id.replace("11labs-", "")

        # Try to get custom voice config
        response = supabase.table("voices") \
            .select("*") \
            .eq("voice_id", clean_voice_id) \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()

        if response.data and len(response.data) > 0:
            voice_data = response.data[0]
            return {
                "voice_id": clean_voice_id,
                "stability": float(voice_data.get("stability", 0.5)),
                "similarity_boost": float(voice_data.get("similarity_boost", 0.75)),
                "style": float(voice_data.get("style", 0.0)),
                "use_speaker_boost": voice_data.get("use_speaker_boost", True),
            }
    except Exception as e:
        logger.warning(f"Could not fetch voice config: {e}")

    # Return defaults for preset voices
    return {
        "voice_id": voice_id.replace("11labs-", ""),
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": True,
    }


def create_transfer_tool(user_id: str, transfer_numbers: list, room_name: str):
    """Create transfer function tool based on user's transfer numbers"""

    @function_tool(description="Transfer the active call to another phone number using SignalWire")
    async def transfer_call(
        transfer_to: Annotated[str, "The label or number to transfer to (e.g., 'mobile', 'office', 'Rick')"]
    ):
        """Transfer the call to a specified number via SignalWire"""
        logger.info(f"Transfer requested to: {transfer_to}")

        # Find matching transfer number
        transfer_config = None
        for num in transfer_numbers:
            if num["label"].lower() == transfer_to.lower():
                transfer_config = num
                break

        if not transfer_config:
            return f"I don't have a transfer number configured for '{transfer_to}'. Available options are: {', '.join([n['label'] for n in transfer_numbers])}"

        # Execute call transfer via SignalWire API
        try:
            import aiohttp

            signalwire_space = os.getenv("SIGNALWIRE_SPACE")
            signalwire_project = os.getenv("SIGNALWIRE_PROJECT_ID")
            signalwire_token = os.getenv("SIGNALWIRE_API_TOKEN")

            # Call SignalWire API to transfer the active call
            async with aiohttp.ClientSession() as session:
                auth = aiohttp.BasicAuth(signalwire_project, signalwire_token)

                # Get current call SID from room metadata
                transfer_url = f"https://{signalwire_space}/api/laml/2010-04-01/Accounts/{signalwire_project}/Calls"

                # Initiate transfer
                async with session.post(
                    transfer_url,
                    auth=auth,
                    data={
                        "To": transfer_config['phone_number'],
                        "From": transfer_config.get('caller_id', ''),  # Use configured caller ID
                        "Url": f"{os.getenv('SUPABASE_URL')}/functions/v1/signalwire-transfer-handler",
                    }
                ) as resp:
                    if resp.status == 201:
                        logger.info(f"Successfully initiated transfer to {transfer_config['phone_number']}")
                        return f"Transferring you to {transfer_config['label']} now. Please hold..."
                    else:
                        error_text = await resp.text()
                        logger.error(f"Transfer failed: {error_text}")
                        return f"I'm having trouble transferring your call. Let me take your information instead."

        except Exception as e:
            logger.error(f"Transfer error: {e}")
            return f"I'm having trouble transferring your call right now. Can I take a message instead?"

    return transfer_call


def create_collect_data_tool(user_id: str):
    """Create dynamic data collection tool"""

    @function_tool(description="Store important information collected from the caller during conversation")
    async def collect_caller_data(
        data_type: Annotated[str, "Type of data being collected (e.g., 'email', 'phone', 'name', 'company', 'reason')"],
        data_value: Annotated[str, "The actual data value provided by the caller"],
        context: Annotated[str, "Additional context about why this data was collected"],
    ):
        """Collect and store data from caller during conversation"""
        logger.info(f"Collecting {data_type} from caller: {data_value}")

        # Store in database
        try:
            supabase.table("collected_call_data").insert({
                "user_id": user_id,
                "data_type": data_type,
                "data_value": data_value,
                "context": context,
                "collected_at": "now()",
            }).execute()

            return f"I've noted that information. Thank you!"
        except Exception as e:
            logger.error(f"Failed to store collected data: {e}")
            return "I've noted that information."

    return collect_caller_data


def create_voice_clone_tool(user_id: str):
    """Create voice cloning tool for creating custom ElevenLabs voices"""

    @function_tool(description="Clone a custom voice from an audio sample using ElevenLabs")
    async def clone_voice_from_sample(
        voice_name: Annotated[str, "Name for the cloned voice"],
        audio_sample_url: Annotated[str, "URL to the audio sample file for cloning"],
    ):
        """Clone a voice using ElevenLabs API and store in database"""
        logger.info(f"Voice cloning requested: {voice_name}")

        try:
            import aiohttp

            elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")

            # Download audio sample
            async with aiohttp.ClientSession() as session:
                async with session.get(audio_sample_url) as resp:
                    if resp.status != 200:
                        return "I couldn't download the audio sample. Please try again."

                    audio_data = await resp.read()

                # Clone voice via ElevenLabs API
                async with session.post(
                    "https://api.elevenlabs.io/v1/voices/add",
                    headers={"xi-api-key": elevenlabs_api_key},
                    data=aiohttp.FormData({
                        "name": voice_name,
                        "files": ("sample.wav", audio_data, "audio/wav"),
                        "description": f"Cloned voice for user {user_id}",
                    })
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        voice_id = result.get("voice_id")

                        # Store in database
                        supabase.table("voices").insert({
                            "user_id": user_id,
                            "voice_id": voice_id,
                            "voice_name": voice_name,
                            "is_cloned": True,
                            "created_at": "now()",
                        }).execute()

                        logger.info(f"Voice cloned successfully: {voice_id}")
                        return f"I've successfully cloned your voice as '{voice_name}'. You can now use it for calls!"

                    else:
                        error_text = await resp.text()
                        logger.error(f"Voice cloning failed: {error_text}")
                        return "I had trouble cloning your voice. Please make sure the audio sample is clear and at least 30 seconds long."

        except Exception as e:
            logger.error(f"Voice cloning error: {e}")
            return "I encountered an error while cloning your voice. Please try again later."

    return clone_voice_from_sample


async def entrypoint(ctx: JobContext):
    """Main agent entry point - called for each new LiveKit room"""

    logger.info(f"🚀 AGENT ENTRYPOINT CALLED - Room: {ctx.room.name}")

    # Initialize LiveKit API client for Egress (requires event loop)
    livekit_api = api.LiveKitAPI(livekit_url, livekit_api_key, livekit_api_secret)

    # Parse room metadata
    room_metadata = {}
    try:
        import json
        room_metadata = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
    except:
        logger.warning("Could not parse room metadata")

    logger.info(f"Connecting to room: {ctx.room.name}")
    logger.info(f"Room metadata: {room_metadata}")

    # Initialize transcript collection and call tracking
    transcript_messages = []
    call_sid = None
    call_start_time = asyncio.get_event_loop().time()
    service_number = None
    caller_number = None

    # Get user_id from metadata or look up from service number
    user_id = room_metadata.get("user_id")

    if not user_id:
        # Connect and wait for SIP participant to join
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        # Wait for participant to join
        service_number = None

        # Check existing participants first
        for participant in ctx.room.remote_participants.values():
            if participant.attributes.get("sip.trunkPhoneNumber"):
                service_number = participant.attributes["sip.trunkPhoneNumber"]
                # Get caller number from SIP participant
                caller_number = participant.attributes.get("sip.callID") or participant.identity
                call_sid = participant.attributes.get("sip.callID") or ctx.room.name

                # Log all SIP attributes to debug call_sid mismatch
                logger.info(f"🔍 ALL SIP participant attributes: {participant.attributes}")
                logger.info(f"Found service number from existing SIP participant: {service_number}")
                logger.info(f"Call SID from LiveKit: {call_sid}")
                logger.info(f"Caller number: {caller_number}")
                logger.info(f"Participant identity: {participant.identity}")
                break

        # If no participant yet, wait for one
        if not service_number:
            logger.info("Waiting for SIP participant to join...")
            participant_joined_event = asyncio.Event()

            @ctx.room.on("participant_connected")
            def on_participant_connected(participant):
                logger.info(f"Participant connected: {participant.identity}")
                if participant.attributes.get("sip.trunkPhoneNumber"):
                    nonlocal service_number, call_sid, caller_number
                    service_number = participant.attributes["sip.trunkPhoneNumber"]
                    caller_number = participant.attributes.get("sip.callID") or participant.identity
                    call_sid = participant.attributes.get("sip.callID") or ctx.room.name

                    # Log all SIP attributes to debug call_sid mismatch
                    logger.info(f"🔍 ALL SIP participant attributes: {participant.attributes}")
                    logger.info(f"Found service number from new SIP participant: {service_number}")
                    logger.info(f"Call SID from LiveKit: {call_sid}")
                    logger.info(f"Caller number: {caller_number}")
                    participant_joined_event.set()

            # Wait up to 10 seconds for participant
            try:
                await asyncio.wait_for(participant_joined_event.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                logger.error("Timeout waiting for SIP participant")

        if service_number:
            # Look up user from service_numbers table
            response = supabase.table("service_numbers") \
                .select("user_id") \
                .eq("phone_number", service_number) \
                .eq("is_active", True) \
                .limit(1) \
                .execute()

            if response.data and len(response.data) > 0:
                user_id = response.data[0]["user_id"]
                room_metadata["user_id"] = user_id
                logger.info(f"Looked up user_id from service number: {user_id}")

                # Update call_record with LiveKit's voice platform call ID
                # This allows us to match the call later when saving transcript
                if call_sid and service_number:
                    logger.info(f"Updating call_record with voice_platform_call_id: {call_sid}")
                    import datetime
                    time_window = datetime.datetime.now() - datetime.timedelta(minutes=5)

                    update_response = supabase.table("call_records") \
                        .update({"voice_platform_call_id": call_sid}) \
                        .eq("service_number", service_number) \
                        .eq("user_id", user_id) \
                        .eq("status", "in-progress") \
                        .gte("started_at", time_window.isoformat()) \
                        .execute()

                    if update_response.data and len(update_response.data) > 0:
                        logger.info(f"✅ Updated call_record with voice_platform_call_id")
                    else:
                        logger.warning(f"⚠️ Could not update call_record with voice_platform_call_id")

    if not user_id:
        logger.error("Could not determine user_id")
        return

    # Get user configuration
    user_config = await get_user_config(room_metadata)
    if not user_config:
        logger.error(f"No user config found for user_id: {user_id}")
        return

    user_id = user_config["user_id"]
    logger.info(f"Loaded config for user: {user_id}")

    # Get voice configuration
    voice_id = user_config.get("voice_id", "11labs-Rachel")
    voice_config = await get_voice_config(voice_id, user_id)

    # Get transfer numbers
    transfer_numbers_response = supabase.table("transfer_numbers") \
        .select("*") \
        .eq("user_id", user_id) \
        .execute()

    transfer_numbers = transfer_numbers_response.data or []

    # Get greeting message
    greeting = user_config.get("greeting_template", "Hello! This is Pat. How can I help you today?")
    base_prompt = user_config.get("system_prompt", "You are Pat, a helpful AI assistant.")

    # Voice context suffix - adapts user's single prompt for voice calls
    VOICE_CONTEXT_SUFFIX = """

IMPORTANT CONTEXT:
- You are on a LIVE VOICE CALL with the customer (not texting)
- The customer is SPEAKING to you in real-time
- Speak naturally and conversationally - use natural spoken language
- You can ask clarifying questions and have back-and-forth dialogue
- This is synchronous - they can hear you immediately and respond
- Use spoken phrases like "Sure, I can help with that" not written phrases
- Tools available: You can transfer calls, take messages, help customers
- Be warm, friendly, and professional in your spoken tone"""

    system_prompt = f"{base_prompt}{VOICE_CONTEXT_SUFFIX}"

    logger.info("Voice system prompt applied with context suffix")

    # Already connected earlier to get service number, don't connect again in session.start

    # Create Agent instance - start with no tools, just basic conversation
    # TODO: Add transfer and data collection tools once basic calling works
    assistant = Agent(instructions=system_prompt)

    # Initialize AgentSession
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(
            model="nova-2-phonecall",
            language="en-US",
        ),
        llm=lkopenai.LLM(
            model="gpt-4o-mini",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=voice_config["voice_id"],
            model="eleven_turbo_v2_5",
        ),
    )

    # Track egress (recording) ID
    egress_id = None

    # Track transcript in real-time using conversation_item_added event
    @session.on("conversation_item_added")
    def on_conversation_item(event):
        try:
            logger.info(f"🎤 conversation_item_added event fired! Event type: {type(event)}")

            # Extract text content from the conversation item
            text_content = event.item.text_content if hasattr(event.item, 'text_content') else ""

            logger.info(f"Text content extracted: '{text_content}' (length: {len(text_content)})")

            if text_content:
                role = event.item.role
                speaker = "agent" if role == "assistant" else "user"
                transcript_messages.append({"speaker": speaker, "text": text_content})
                logger.info(f"✅ {speaker.capitalize()} said: {text_content}")
                logger.info(f"📝 Total messages in transcript: {len(transcript_messages)}")
            else:
                logger.warning("⚠️ conversation_item_added event had no text_content")
        except Exception as e:
            logger.error(f"❌ Error in conversation_item_added handler: {e}", exc_info=True)

    # Handle call completion
    async def on_call_end():
        """Save transcript and recording when call ends"""
        try:
            logger.info("📞 Call ending - saving transcript...")

            # Format transcript
            transcript_text = "\n\n".join([
                f"{'Pat' if msg['speaker'] == 'agent' else 'Caller'}: {msg['text']}"
                for msg in transcript_messages
            ])

            logger.info(f"Transcript ({len(transcript_messages)} messages):\n{transcript_text}")

            call_record_id = None

            # Try to find call_record by voice_platform_call_id (LiveKit's SIP callID)
            if call_sid:
                logger.info(f"Looking up call by voice_platform_call_id: {call_sid}")
                response = supabase.table("call_records") \
                    .select("id") \
                    .eq("voice_platform_call_id", call_sid) \
                    .limit(1) \
                    .execute()

                if response.data and len(response.data) > 0:
                    call_record_id = response.data[0]["id"]
                    logger.info(f"✅ Found call_record by voice_platform_call_id: {call_record_id}")
                else:
                    logger.warning(f"⚠️ No call_record found with voice_platform_call_id: {call_sid}")

            # If not found by call_sid, try to find by service_number and recent timestamp
            if not call_record_id and service_number and user_id:
                logger.info(f"Looking up call by service_number: {service_number} and user_id: {user_id}")
                # Look for most recent in-progress call for this service number
                import datetime
                time_window = datetime.datetime.now() - datetime.timedelta(minutes=5)

                response = supabase.table("call_records") \
                    .select("id") \
                    .eq("service_number", service_number) \
                    .eq("user_id", user_id) \
                    .eq("status", "in-progress") \
                    .gte("started_at", time_window.isoformat()) \
                    .order("started_at", desc=True) \
                    .limit(1) \
                    .execute()

                if response.data and len(response.data) > 0:
                    call_record_id = response.data[0]["id"]
                    logger.info(f"Found call_record by service_number: {call_record_id}")

            if call_record_id:
                # Fetch recording URL from LiveKit Egress if recording was started
                recording_url = None
                if egress_id:
                    try:
                        logger.info(f"Fetching recording info for egress_id: {egress_id}")

                        # Create ListEgressRequest with egress_id filter for direct lookup
                        from livekit.protocol import egress as proto_egress
                        list_request = proto_egress.ListEgressRequest(egress_id=egress_id)
                        egress_response = await livekit_api.egress.list_egress(list_request)

                        # ListEgressResponse has 'items' property containing the list
                        if egress_response.items and len(egress_response.items) > 0:
                            egress = egress_response.items[0]

                            # Get the file URL from the egress
                            if egress.file_results and len(egress.file_results) > 0:
                                recording_url = egress.file_results[0].download_url
                                logger.info(f"✅ Recording URL: {recording_url}")
                            elif hasattr(egress, 'file') and egress.file and hasattr(egress.file, 'download_url'):
                                recording_url = egress.file.download_url
                                logger.info(f"✅ Recording URL (legacy): {recording_url}")
                            else:
                                logger.warning(f"Egress {egress_id} found but no download URL yet (status: {egress.status})")
                        else:
                            logger.warning(f"Egress {egress_id} not found or no items returned")
                    except Exception as e:
                        logger.error(f"Error fetching recording URL: {e}", exc_info=True)

                # Update call_record with transcript and recording
                update_data = {
                    "transcript": transcript_text,
                    "status": "completed",
                    "ended_at": "now()"
                }

                if recording_url:
                    update_data["recording_url"] = recording_url

                supabase.table("call_records") \
                    .update(update_data) \
                    .eq("id", call_record_id) \
                    .execute()

                logger.info(f"✅ Call transcript saved to database{' with recording' if recording_url else ''}")
            else:
                logger.warning("No call_record found - cannot save transcript")

        except Exception as e:
            logger.error(f"Error saving transcript: {e}", exc_info=True)

    # Register cleanup handler
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"📞 Participant disconnected: {participant.identity}")
        logger.info(f"📝 Transcript has {len(transcript_messages)} messages before save")
        # Run async cleanup - use ensure_future to handle async properly
        asyncio.ensure_future(on_call_end())

    # Start recording the call using LiveKit Egress BEFORE starting session
    try:
        logger.info(f"🎙️ Starting call recording for room: {ctx.room.name}")

        from livekit.protocol import egress as proto_egress

        # Configure S3 upload for recording storage
        s3_upload = proto_egress.S3Upload(
            access_key=os.getenv("AWS_ACCESS_KEY_ID"),
            secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region=os.getenv("AWS_REGION", "us-west-2"),
            bucket=os.getenv("AWS_S3_BUCKET", "pat-livekit-recordings"),
        )

        # Create room composite egress to record audio with S3 storage
        egress_request = proto_egress.RoomCompositeEgressRequest(
            room_name=ctx.room.name,
            audio_only=True,  # Only record audio, not video
            file_outputs=[
                proto_egress.EncodedFileOutput(
                    file_type=proto_egress.EncodedFileType.MP4,
                    filepath=f"recordings/{ctx.room.name}.m4a",
                    s3=s3_upload,
                )
            ],
        )

        egress_response = await livekit_api.egress.start_room_composite_egress(egress_request)
        egress_id = egress_response.egress_id
        logger.info(f"✅ Recording started with egress_id: {egress_id}")
    except Exception as e:
        logger.error(f"❌ Failed to start recording: {e}", exc_info=True)
        # Continue with call even if recording fails

    # Start the session - room already connected, so session takes over
    await session.start(room=ctx.room, agent=assistant)

    # Say greeting when participant joins - use instructions parameter
    await session.generate_reply(instructions=f"Say this greeting to the caller: {greeting}")

    logger.info("✅ Agent session started successfully - ready for calls")


if __name__ == "__main__":
    import sys
    import threading
    from http.server import HTTPServer, BaseHTTPRequestHandler

    # Simple HTTP server for Render health checks
    class HealthCheckHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'LiveKit Agent Running')

        def log_message(self, format, *args):
            pass  # Suppress logs

    # Check if we should run health check server BEFORE cli.run_app
    if len(sys.argv) > 1 and sys.argv[1] == "healthcheck":
        port = int(os.getenv('PORT', 10000))

        # Start health check server immediately in background
        server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        logger.info(f"Health check server started on port {port}")

        # Remove 'healthcheck' from argv so LiveKit CLI doesn't see it
        sys.argv = [sys.argv[0], "start"]

    # Run the agent worker with error handling
    try:
        logger.info("🎬 Starting LiveKit agent worker...")
        cli.run_app(WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="SW Telephony Agent"
        ))
    except KeyboardInterrupt:
        logger.info("⚠️ Agent worker stopped by user (KeyboardInterrupt)")
    except Exception as e:
        logger.error(f"❌ AGENT WORKER CRASHED: {e}", exc_info=True)
        raise
    finally:
        logger.warning("🛑 Agent worker has exited")
