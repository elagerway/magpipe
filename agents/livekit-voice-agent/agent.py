"""
Pat AI Voice Agent - LiveKit Implementation
Handles real-time voice conversations with STT, LLM, and TTS pipeline
"""

import asyncio
import logging
import os
from typing import Annotated

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice import Agent as VoiceAgent
from livekit.plugins import deepgram, openai as lkopenai, elevenlabs

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
            .single() \
            .execute()

        return response.data
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
            .single() \
            .execute()

        if response.data:
            return {
                "voice_id": clean_voice_id,
                "stability": float(response.data.get("stability", 0.5)),
                "similarity_boost": float(response.data.get("similarity_boost", 0.75)),
                "style": float(response.data.get("style", 0.0)),
                "use_speaker_boost": response.data.get("use_speaker_boost", True),
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

    @llm.function_tool(description="Transfer the active call to another phone number using SignalWire")
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

    @llm.function_tool(description="Store important information collected from the caller during conversation")
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

    @llm.function_tool(description="Clone a custom voice from an audio sample using ElevenLabs")
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

    # Parse room metadata
    room_metadata = {}
    try:
        import json
        room_metadata = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
    except:
        logger.warning("Could not parse room metadata")

    logger.info(f"Connecting to room: {ctx.room.name}")
    logger.info(f"Room metadata: {room_metadata}")

    # Get user_id from metadata or look up from service number
    user_id = room_metadata.get("user_id")

    if not user_id:
        # Wait for SIP participant to join and get their attributes
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        # Find SIP participant and get service number
        service_number = None
        for participant in ctx.room.remote_participants.values():
            if participant.attributes.get("sip.trunkPhoneNumber"):
                service_number = participant.attributes["sip.trunkPhoneNumber"]
                logger.info(f"Found service number from SIP participant: {service_number}")
                break

        if service_number:
            # Look up user from service_numbers table
            response = supabase.table("service_numbers") \
                .select("user_id") \
                .eq("phone_number", service_number) \
                .eq("is_active", True) \
                .single() \
                .execute()

            if response.data:
                user_id = response.data["user_id"]
                room_metadata["user_id"] = user_id
                logger.info(f"Looked up user_id from service number: {user_id}")

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

    # Configure initial agent context
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=user_config.get("system_prompt", "You are Pat, a helpful AI assistant.")
    )

    # Add greeting message
    greeting = user_config.get("greeting_template", "Hello! This is Pat. How can I help you today?")

    # Already connected earlier to get service number, so skip second connect

    # Create function tools
    tools = []
    if transfer_numbers:
        tools.append(create_transfer_tool(user_id, transfer_numbers, ctx.room.name))
    tools.append(create_collect_data_tool(user_id))
    tools.append(create_voice_clone_tool(user_id))

    # Initialize voice agent
    agent = VoiceAgent(
        vad=rtc.VAD.load(),
        stt=deepgram.STT(
            model="nova-2-phonecall",
            language="en-US",
        ),
        llm=lkopenai.LLM(
            model="gpt-4o-mini",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            voice=voice_config["voice_id"],
            model="eleven_turbo_v2_5",
            # Voice settings from database
            stability=voice_config["stability"],
            similarity_boost=voice_config["similarity_boost"],
            optimize_streaming_latency=4,
        ),
        chat_ctx=initial_ctx,
        fnc_ctx=llm.ToolContext() if tools else None,
    )

    # Start the agent
    agent.start(ctx.room)

    # Say greeting when participant joins
    await agent.say(greeting, allow_interruptions=True)

    logger.info("Agent started successfully")


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

    # Run the agent worker
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="SW Telephony Agent"
    ))
