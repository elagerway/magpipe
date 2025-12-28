#!/usr/bin/env python3
"""
Pat AI Voice Agent - LiveKit Implementation
Handles real-time voice conversations with STT, LLM, and TTS pipeline
"""

import aiohttp
import asyncio
import datetime
import json
import logging
import os
import re
import sys
import threading
from typing import Annotated

# Force unbuffered output for immediate log visibility in Render
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass  # Silently continue if reconfigure not available

from livekit import rtc, api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
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
import bcrypt

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Log immediately on module load to verify script is running
print("=" * 80, flush=True)
print("AGENT SCRIPT LOADED - Python process started", flush=True)
print(f"Python version: {sys.version}", flush=True)
print(f"Working directory: {os.getcwd()}", flush=True)
print("=" * 80, flush=True)
logger.info("🚀 Agent module imported successfully")

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# Helper function to log call state to database
def log_call_state(room_name: str, state: str, component: str = 'agent', details: dict = None, error_message: str = None):
    """Log call state to database for debugging"""
    try:
        supabase.table('call_state_logs').insert({
            'call_id': None,  # Will be looked up by room_name if needed
            'room_name': room_name,
            'state': state,
            'component': component,
            'details': details,
            'error_message': error_message,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log call state: {e}")
        # Don't raise - logging should never break the call flow

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


def normalize_voice_to_digits(text: str) -> str:
    """Convert spoken numbers to digit string (e.g., 'one two three' -> '123')"""
    # Map of spoken numbers to digits
    word_to_digit = {
        "zero": "0", "oh": "0", "o": "0",
        "one": "1", "won": "1",
        "two": "2", "to": "2", "too": "2",
        "three": "3", "tree": "3",
        "four": "4", "for": "4", "fore": "4",
        "five": "5",
        "six": "6", "sicks": "6",
        "seven": "7",
        "eight": "8", "ate": "8",
        "nine": "9", "niner": "9",
    }

    # Split text into words and convert to digits
    words = text.lower().split()
    digits = []

    for word in words:
        # Remove punctuation
        clean_word = re.sub(r'[^\w]', '', word)

        # Check if already a digit
        if clean_word.isdigit():
            digits.append(clean_word)
        elif clean_word in word_to_digit:
            digits.append(word_to_digit[clean_word])

    return ''.join(digits)


async def check_phone_admin_access(caller_number: str) -> dict:
    """Check if caller number is registered for admin access"""
    try:
        # Normalize phone number (remove +, spaces, dashes)
        normalized = re.sub(r'[^\d]', '', caller_number)

        # Query users table for matching phone number
        response = supabase.table("users") \
            .select("id, full_name, phone, phone_admin_access_code, phone_admin_locked") \
            .eq("phone", f"+{normalized}") \
            .limit(1) \
            .execute()

        if response.data and len(response.data) > 0:
            user_data = response.data[0]

            # Check if user has admin access code configured
            if user_data.get("phone_admin_access_code"):
                return {
                    "has_access": True,
                    "user_id": user_data["id"],
                    "full_name": user_data.get("full_name", ""),
                    "access_code_hash": user_data["phone_admin_access_code"],
                    "is_locked": user_data.get("phone_admin_locked", False),
                }
    except Exception as e:
        logger.error(f"Error checking phone admin access: {e}")

    return {"has_access": False}


async def verify_access_code(user_id: str, spoken_code: str, access_code_hash: str) -> bool:
    """Verify spoken access code against hashed value"""
    try:
        # Normalize spoken input to digits
        code_digits = normalize_voice_to_digits(spoken_code)

        logger.info(f"Verifying access code: spoken='{spoken_code}' normalized='{code_digits}'")

        # Verify with bcrypt
        return bcrypt.checkpw(code_digits.encode('utf-8'), access_code_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Error verifying access code: {e}")
        return False


async def log_access_attempt(user_id: str, success: bool, caller_number: str):
    """Log access code attempt to database"""
    try:
        supabase.table("access_code_attempts").insert({
            "user_id": user_id,
            "success": success,
            "attempted_at": datetime.datetime.now().isoformat(),
            "caller_phone": caller_number,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log access attempt: {e}")


async def check_and_lock_account(user_id: str) -> bool:
    """Check failed attempts and lock account if threshold exceeded. Returns True if locked."""
    try:
        # Get failed attempts in last 15 minutes
        time_window = datetime.datetime.now() - datetime.timedelta(minutes=15)

        response = supabase.table("access_code_attempts") \
            .select("*", count="exact") \
            .eq("user_id", user_id) \
            .eq("success", False) \
            .gte("attempted_at", time_window.isoformat()) \
            .execute()

        failed_count = response.count or 0

        logger.info(f"Failed access attempts for user {user_id}: {failed_count}")

        if failed_count >= 5:
            # Lock the account
            supabase.table("users").update({
                "phone_admin_locked": True,
                "phone_admin_locked_at": datetime.datetime.now().isoformat(),
            }).eq("id", user_id).execute()

            logger.warning(f"Account locked for user {user_id} due to {failed_count} failed attempts")
            return True

        return False
    except Exception as e:
        logger.error(f"Error checking/locking account: {e}")
        return False


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


async def prewarm(proc: JobProcess):
    """
    Prewarm function for explicit agent dispatch.
    This is called when the agent receives an explicit dispatch request.
    """
    logger.info(f"🔥 PREWARM CALLED - Agent received explicit dispatch")
    # Keep the process running until shutdown
    await proc.wait_for_shutdown()


async def entrypoint(ctx: JobContext):
    """Main agent entry point - called for each new LiveKit room"""

    logger.info(f"🚀 ===============================================")
    logger.info(f"🚀 AGENT ENTRYPOINT CALLED")
    logger.info(f"🚀 ===============================================")
    logger.info(f"   → Room: {ctx.room.name}")
    logger.info(f"   → Timestamp: {datetime.datetime.now().isoformat()}")

    # Log: Agent entrypoint called
    log_call_state(ctx.room.name, 'agent_entrypoint_called', 'agent', {
        'room_name': ctx.room.name,
        'timestamp': datetime.datetime.now().isoformat(),
    })

    # Initialize LiveKit API client for Egress (requires event loop)
    livekit_api = api.LiveKitAPI(livekit_url, livekit_api_key, livekit_api_secret)

    # Parse room metadata
    room_metadata = {}
    try:
        room_metadata = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
    except:
        logger.warning("Could not parse room metadata")

    logger.info(f"📋 Room metadata: {room_metadata}")
    logger.info(f"🔌 Connecting to room: {ctx.room.name}")

    # Initialize transcript collection and call tracking
    transcript_messages = []
    call_sid = None
    call_start_time = asyncio.get_event_loop().time()
    service_number = None
    caller_number = None

    # ALWAYS connect to room first (required for both inbound and outbound)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("✅ Connected to LiveKit room")

    # Log: Agent connected to room
    log_call_state(ctx.room.name, 'agent_connected', 'agent', {
        'room_name': ctx.room.name,
        'auto_subscribe': 'AUDIO_ONLY',
    })

    # Get user_id from metadata or look up from service number
    user_id = room_metadata.get("user_id")

    if not user_id:
        # For inbound calls without metadata, wait for SIP participant to join

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
                    logger.info(f"Updating call_record with LiveKit call ID: {call_sid}")
                    time_window = datetime.datetime.now() - datetime.timedelta(minutes=5)

                    update_response = supabase.table("call_records") \
                        .update({"livekit_call_id": call_sid}) \
                        .eq("service_number", service_number) \
                        .eq("user_id", user_id) \
                        .eq("status", "in-progress") \
                        .gte("started_at", time_window.isoformat()) \
                        .execute()

                    if update_response.data and len(update_response.data) > 0:
                        logger.info(f"✅ Updated call_record with livekit_call_id")
                    else:
                        logger.warning(f"⚠️ Could not update call_record with livekit_call_id")

    if not user_id:
        logger.error("Could not determine user_id")
        return

    # Get direction from metadata or database to determine agent role (MUST be before admin check)
    direction = room_metadata.get("direction")
    contact_phone = room_metadata.get("contact_phone")

    # If direction not in metadata, check database (for bridged outbound calls)
    if not direction and user_id:
        try:
            # Look up the most recent call for this user (within last 60 seconds)
            # Use time-based filter instead of status because SignalWire status callback may fire before agent
            one_minute_ago = (datetime.datetime.utcnow() - datetime.timedelta(seconds=60)).isoformat()
            logger.info(f"📊 Looking up direction for user_id={user_id}, since={one_minute_ago}")

            # First try with service_number (for inbound calls where it matches)
            call_lookup = None
            if service_number:
                logger.info(f"📊 Trying lookup with service_number={service_number}")
                call_lookup = supabase.table("call_records") \
                    .select("direction, contact_phone") \
                    .eq("service_number", service_number) \
                    .eq("user_id", user_id) \
                    .gte("created_at", one_minute_ago) \
                    .order("created_at", desc=True) \
                    .limit(1) \
                    .execute()

            # If no match, try without service_number (for bridged outbound where LiveKit trunk number != caller_id)
            if not call_lookup or not call_lookup.data or len(call_lookup.data) == 0:
                logger.info(f"📊 No match with service_number, trying without (for bridged outbound)")
                call_lookup = supabase.table("call_records") \
                    .select("direction, contact_phone, service_number") \
                    .eq("user_id", user_id) \
                    .gte("created_at", one_minute_ago) \
                    .order("created_at", desc=True) \
                    .limit(1) \
                    .execute()

            if call_lookup.data and len(call_lookup.data) > 0:
                direction = call_lookup.data[0].get("direction", "inbound")
                if not contact_phone:
                    contact_phone = call_lookup.data[0].get("contact_phone")
                found_service_number = call_lookup.data[0].get("service_number")
                logger.info(f"📊 Found call direction from database: {direction}, contact_phone: {contact_phone}, service_number: {found_service_number}")
            else:
                logger.warning(f"📊 No recent call found for user_id={user_id}")
        except Exception as e:
            logger.warning(f"Could not look up call direction: {e}")
            direction = "inbound"  # Default to inbound if lookup fails

    if not direction:
        direction = "inbound"  # Final fallback

    logger.info(f"📞 Call direction: {direction}")
    logger.info(f"📞 Contact phone: {contact_phone}")

    # Store admin check info for later (after session is created)
    admin_check_info = None
    if direction != "outbound" and caller_number:
        logger.info(f"🔐 Checking phone admin access for caller: {caller_number}")
        admin_check_info = await check_phone_admin_access(caller_number)
        if admin_check_info.get("has_access"):
            logger.info(f"📱 Admin access possible for: {admin_check_info.get('full_name')}")

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

    # Get greeting message and base prompt
    base_prompt = user_config.get("system_prompt", "You are Pat, a helpful AI assistant.")

    # Different prompts and behavior based on call direction
    if direction == "outbound":
        # OUTBOUND: Agent is calling someone on behalf of the owner
        greeting = ""  # Don't greet - wait for destination to answer

        OUTBOUND_CONTEXT_SUFFIX = """

IMPORTANT CONTEXT - OUTBOUND CALL:
- You are making an outbound call to someone on behalf of your owner
- The person you're calling will answer first (typically saying "Hello?")
- WAIT for them to speak first before responding
- Once they speak, introduce yourself professionally: "Hi, this is Pat calling from [owner's business/name]..."
- Explain the purpose of your call clearly and concisely
- Be polite and respectful - they didn't initiate this call, you did
- If they ask how you got their number, explain you're calling on behalf of [owner]
- Be prepared for them to be busy or uninterested - respect their time
- If they want to end the call, politely thank them and hang up
- Your goal: Have a professional, helpful conversation on behalf of your owner
- Common scenarios: Sales outreach, appointment reminders, surveys, follow-ups"""

        system_prompt = f"{base_prompt}{OUTBOUND_CONTEXT_SUFFIX}"
        logger.info("🔄 Outbound call - Agent calling destination on behalf of owner")
    else:
        # INBOUND: Agent handles the call for the user (traditional behavior)
        greeting = user_config.get("greeting_template", "Hello! This is Pat. How can I help you today?")

        INBOUND_CONTEXT_SUFFIX = """

IMPORTANT CONTEXT - INBOUND CALL:
- You are on a LIVE VOICE CALL with a customer calling in (not texting)
- The customer is SPEAKING to you in real-time
- Speak naturally and conversationally - use natural spoken language
- You can ask clarifying questions and have back-and-forth dialogue
- This is synchronous - they can hear you immediately and respond
- Use spoken phrases like "Sure, I can help with that" not written phrases
- Tools available: You can transfer calls, take messages, help customers
- Be warm, friendly, and professional in your spoken tone"""

        system_prompt = f"{base_prompt}{INBOUND_CONTEXT_SUFFIX}"
        logger.info("📥 Inbound call - Agent handling customer service")

    logger.info(f"Voice system prompt applied for {direction} call")

    # Already connected earlier to get service number, don't connect again in session.start

    # Create Agent instance - start with no tools, just basic conversation
    # TODO: Add transfer and data collection tools once basic calling works
    assistant = Agent(instructions=system_prompt)

    # Initialize AgentSession with low-latency configuration
    # VAD tuning: lower min_silence_duration = faster response (default is 0.5s)
    session = AgentSession(
        vad=silero.VAD.load(
            min_silence_duration=0.4,   # Balanced response (default 0.5s)
            min_speech_duration=0.1,    # Default speech detection
            activation_threshold=0.5,   # Default sensitivity
        ),
        stt=deepgram.STT(
            model="nova-2-phonecall",
            language="en-US",
        ),
        llm=lkopenai.LLM(
            model="gpt-4-turbo",  # Fast with good quality
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            model="eleven_turbo_v2_5",  # Low-latency streaming model
            voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel - default preset voice
            api_key=os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_API_KEY"),
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

            # Try to find call_record by livekit_call_id (LiveKit's SIP callID)
            if call_sid:
                logger.info(f"Looking up call by livekit_call_id: {call_sid}")
                response = supabase.table("call_records") \
                    .select("id") \
                    .eq("livekit_call_id", call_sid) \
                    .limit(1) \
                    .execute()

                if response.data and len(response.data) > 0:
                    call_record_id = response.data[0]["id"]
                    logger.info(f"✅ Found call_record by livekit_call_id: {call_record_id}")
                else:
                    logger.warning(f"⚠️ No call_record found with livekit_call_id: {call_sid}")

            # If not found by call_sid, try to find by service_number and recent timestamp
            if not call_record_id and user_id:
                # Look for most recent call for this user (within last 5 minutes)
                # Don't filter by status - SignalWire may have already updated it to "completed"
                time_window = datetime.datetime.utcnow() - datetime.timedelta(minutes=5)

                # First try with service_number (for inbound calls where it matches)
                if service_number:
                    logger.info(f"Looking up call by service_number: {service_number} and user_id: {user_id}")
                    response = supabase.table("call_records") \
                        .select("id") \
                        .eq("service_number", service_number) \
                        .eq("user_id", user_id) \
                        .gte("created_at", time_window.isoformat()) \
                        .order("created_at", desc=True) \
                        .limit(1) \
                        .execute()

                    if response.data and len(response.data) > 0:
                        call_record_id = response.data[0]["id"]
                        logger.info(f"Found call_record by service_number: {call_record_id}")

                # If no match, try without service_number (for bridged outbound where LiveKit trunk != caller_id)
                if not call_record_id:
                    logger.info(f"No match with service_number, trying user_id only (for bridged outbound)")
                    response = supabase.table("call_records") \
                        .select("id") \
                        .eq("user_id", user_id) \
                        .gte("created_at", time_window.isoformat()) \
                        .order("created_at", desc=True) \
                        .limit(1) \
                        .execute()

                    if response.data and len(response.data) > 0:
                        call_record_id = response.data[0]["id"]
                        logger.info(f"Found call_record by user_id only: {call_record_id}")

            if call_record_id:
                # Save egress_id for deferred recording URL fetch
                # Don't try to fetch URL immediately - egress takes time to process
                update_data = {
                    "transcript": transcript_text,
                    "status": "completed",
                    "ended_at": "now()"
                }

                if egress_id:
                    update_data["egress_id"] = egress_id
                    logger.info(f"💾 Saving egress_id {egress_id} for deferred recording URL fetch")

                supabase.table("call_records") \
                    .update(update_data) \
                    .eq("id", call_record_id) \
                    .execute()

                logger.info(f"✅ Call transcript saved to database{' with egress_id' if egress_id else ''}")
            else:
                logger.warning("No call_record found - cannot save transcript")

        except Exception as e:
            logger.error(f"Error saving transcript: {e}", exc_info=True)

    # Register cleanup handler
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"📞 Participant disconnected: {participant.identity}")
        logger.info(f"📝 Transcript has {len(transcript_messages)} messages before save")

        # Wait a moment for any pending transcriptions to complete
        async def delayed_cleanup():
            logger.info("⏳ Waiting 2 seconds for pending transcriptions...")
            await asyncio.sleep(2)
            logger.info(f"📝 Final transcript message count: {len(transcript_messages)}")
            await on_call_end()

        # Run async cleanup - use ensure_future to handle async properly
        asyncio.ensure_future(delayed_cleanup())

    # Start the session FIRST for lowest latency - recording starts in background
    await session.start(room=ctx.room, agent=assistant)
    logger.info("✅ Session started - agent is now listening")

    # Start recording in background (don't block the conversation)
    async def start_recording_background():
        nonlocal egress_id
        try:
            logger.info(f"🎙️ Starting call recording for room: {ctx.room.name}")

            from livekit.protocol import egress as proto_egress

            # Check AWS credentials
            aws_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
            aws_region = os.getenv("AWS_REGION", "us-west-2")
            aws_bucket = os.getenv("AWS_S3_BUCKET", "pat-livekit-recordings")

            if not aws_key or not aws_secret:
                logger.warning("⚠️ AWS credentials not set - recording disabled")
                return

            # Configure S3 upload for recording storage
            s3_upload = proto_egress.S3Upload(
                access_key=aws_key,
                secret=aws_secret,
                region=aws_region,
                bucket=aws_bucket,
            )

            # Create room composite egress to record audio with S3 storage
            clean_room_name = ctx.room.name.replace("_+", "")

            egress_request = proto_egress.RoomCompositeEgressRequest(
                room_name=ctx.room.name,
                audio_only=True,
                file_outputs=[
                    proto_egress.EncodedFileOutput(
                        file_type=proto_egress.EncodedFileType.MP4,
                        filepath=f"recordings/{clean_room_name}.mp4",
                        s3=s3_upload,
                    )
                ],
            )

            egress_response = await asyncio.wait_for(
                livekit_api.egress.start_room_composite_egress(egress_request),
                timeout=10.0
            )
            egress_id = egress_response.egress_id
            logger.info(f"✅ Recording started with egress_id: {egress_id}")
        except asyncio.TimeoutError:
            logger.error("❌ Recording start timed out")
        except Exception as e:
            logger.error(f"❌ Failed to start recording: {e}")

    # Fire and forget - recording starts while agent is already listening
    asyncio.ensure_future(start_recording_background())

    # Handle phone admin authentication if applicable (after session started)
    is_admin_authenticated = False

    if admin_check_info and admin_check_info.get("has_access"):
        admin_user_id = admin_check_info["user_id"]
        full_name = admin_check_info["full_name"]
        is_locked = admin_check_info["is_locked"]
        access_code_hash = admin_check_info["access_code_hash"]

        # Check if account is locked
        if is_locked:
            logger.warning(f"⚠️ Account is locked for user {admin_user_id}")
            await session.say("Your admin access is currently locked due to too many failed attempts. Please reset your access code via the web application.", allow_interruptions=False)
            # End call by returning
            return

        # Ask for identity confirmation
        await session.say(f"Is this {full_name}?", allow_interruptions=True)

        # Wait for user's spoken response using session's built-in speech recognition
        # We'll listen for the next user speech and check for affirmative
        identity_confirmed_event = asyncio.Event()
        identity_confirmed = False

        @session.on("user_speech_committed")
        def on_identity_response(event):
            nonlocal identity_confirmed
            if hasattr(event, 'item') and hasattr(event.item, 'content'):
                response_text = event.item.content.lower()
                logger.info(f"Identity confirmation response: {response_text}")

                # Check for affirmative
                if any(word in response_text for word in ['yes', 'yeah', 'yep', 'correct', 'that\'s me', 'this is']):
                    identity_confirmed = True

            identity_confirmed_event.set()

        try:
            # Wait up to 10 seconds for response
            await asyncio.wait_for(identity_confirmed_event.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning("Identity confirmation timed out")

        if not identity_confirmed:
            logger.info("Identity not confirmed - proceeding as regular call")
            await session.say(greeting, allow_interruptions=True)
        else:
            # Ask for access code
            await session.say("Please say your access code, one digit at a time.", allow_interruptions=False)

            # Wait for access code
            access_code_event = asyncio.Event()
            access_code_spoken = ""

            @session.on("user_speech_committed")
            def on_access_code_response(event):
                nonlocal access_code_spoken
                if hasattr(event, 'item') and hasattr(event.item, 'content'):
                    access_code_spoken = event.item.content
                    logger.info(f"Access code spoken: {access_code_spoken}")
                access_code_event.set()

            try:
                # Wait up to 15 seconds for access code
                await asyncio.wait_for(access_code_event.wait(), timeout=15.0)
            except asyncio.TimeoutError:
                logger.warning("Access code input timed out")

            if access_code_spoken:
                # Verify access code
                is_valid = await verify_access_code(admin_user_id, access_code_spoken, access_code_hash)

                # Log attempt
                await log_access_attempt(admin_user_id, is_valid, caller_number)

                if is_valid:
                    logger.info(f"✅ Admin authenticated successfully for user {admin_user_id}")
                    is_admin_authenticated = True

                    # Update system prompt for admin mode
                    ADMIN_MODE_PROMPT = """
ADMIN MODE ACTIVATED:
- You are now speaking with the account owner for admin configuration
- You can help them update system prompts, add knowledge sources, configure settings
- Be helpful and guide them through configuration options
- They can ask questions about their current setup
- Available actions: update prompts, add/remove knowledge sources, configure transfer numbers
- Always confirm actions before applying them"""

                    # Update agent's instructions to admin mode
                    assistant.instructions = f"{base_prompt}{ADMIN_MODE_PROMPT}"

                    await session.say("Access granted. You are now in admin mode. How can I help you configure your assistant?", allow_interruptions=True)
                else:
                    logger.warning(f"❌ Invalid access code for user {admin_user_id}")

                    # Check if account should be locked
                    is_locked = await check_and_lock_account(admin_user_id)

                    if is_locked:
                        await session.say("Too many failed attempts. Your admin access has been locked. Please reset your access code via the web application.", allow_interruptions=False)
                        return
                    else:
                        await session.say("Incorrect access code. Proceeding as a regular call.", allow_interruptions=True)
                        await session.say(greeting, allow_interruptions=True)
            else:
                # No access code provided - proceed as regular call
                await session.say("No access code provided. Proceeding as a regular call.", allow_interruptions=True)
                await session.say(greeting, allow_interruptions=True)
    else:
        # For inbound calls, greet immediately
        # For outbound calls, wait for user to speak first
        if direction == "inbound":
            # Say greeting immediately when participant joins - use say() for instant response
            # (don't use generate_reply() which adds LLM latency)
            await session.say(greeting, allow_interruptions=True)
            logger.info("📞 Inbound call - Agent greeted caller")
        else:
            # Outbound call - don't greet, wait for user to speak
            logger.info("📞 Outbound call - Agent waiting for user to speak first")

    logger.info("✅ Agent session started successfully - ready for calls")

    # Close LiveKit API client to avoid resource leaks
    try:
        await livekit_api.aclose()
        logger.info("🔌 LiveKit API client closed")
    except Exception as e:
        logger.warning(f"Error closing LiveKit API client: {e}")


if __name__ == "__main__":
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
        logger.info("   → Agent Name: SW Telephony Agent")
        logger.info("   → Agent will join rooms automatically via LiveKit Cloud dispatch rules")
        cli.run_app(WorkerOptions(
            entrypoint_fnc=entrypoint,  # Called when agent joins a room
            prewarm_fnc=prewarm,  # Called for explicit agent dispatch
            agent_name="SW Telephony Agent",
            num_idle_processes=0  # Disable worker pool to avoid DuplexClosed errors
        ))
    except KeyboardInterrupt:
        logger.info("⚠️ Agent worker stopped by user (KeyboardInterrupt)")
    except Exception as e:
        logger.error(f"❌ AGENT WORKER CRASHED: {e}", exc_info=True)
        raise
    finally:
        logger.warning("🛑 Agent worker has exited")
