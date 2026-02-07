#!/usr/bin/env python3
"""
Pat AI Voice Agent - LiveKit Implementation
Handles real-time voice conversations with STT, LLM, and TTS pipeline
"""

import aiohttp
import asyncio
import datetime
import hashlib
import hmac
import json
import logging
import os
import re
import sys
import threading
import time as time_module
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
import openai

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
    """Fetch user's agent configuration from Supabase.

    Requires agent_id to be set in room_metadata (from service_number lookup).
    Returns None if no agent is assigned - caller handles with 'not assigned' message.
    """
    user_id = room_metadata.get("user_id")
    agent_id = room_metadata.get("agent_id")

    if not user_id:
        logger.error("No user_id in room metadata")
        return None

    # No agent assigned to this number
    if not agent_id:
        logger.warning(f"No agent assigned to this number")
        return None

    try:
        # Fetch agent by ID only - agent_id is already unique
        # This allows system agent (owned by admin) to work for any user's numbers
        response = supabase.table("agent_configs") \
            .select("*") \
            .eq("id", agent_id) \
            .limit(1) \
            .execute()

        if response.data and len(response.data) > 0:
            logger.info(f"Using agent: {response.data[0].get('name')} (id: {agent_id})")
            return response.data[0]

        logger.warning(f"Agent {agent_id} not found")
        return None
    except Exception as e:
        logger.error(f"Failed to fetch user config: {e}")
        return None


async def speak_error_and_disconnect(ctx: JobContext, message: str):
    """Create a minimal session to speak an error message and disconnect."""
    try:
        logger.info(f"🔊 Speaking error message: {message}")

        # Ensure room is connected (try to connect, will no-op if already connected)
        try:
            await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
            logger.info("✅ Connected to room for error message")
        except Exception:
            logger.info("Room already connected")
            pass

        # Wait for SIP participant to be ready
        await asyncio.sleep(0.5)

        # Create minimal TTS-only session
        error_session = AgentSession(
            vad=silero.VAD.load(),
            stt=deepgram.STT(model="nova-2-phonecall", language="en-US"),
            llm=lkopenai.LLM(model="gpt-4.1-nano"),
            tts=elevenlabs.TTS(
                model="eleven_flash_v2_5",
                voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel
                api_key=os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_API_KEY"),
            ),
        )

        # Create a minimal agent just to speak the message
        error_agent = Agent(instructions="You are a system message agent.")

        # Start session
        await error_session.start(ctx.room, agent=error_agent)
        logger.info("✅ Error session started")

        # Wait for participant to be subscribed
        await asyncio.sleep(1)

        # Speak the error message
        await error_session.say(message, allow_interruptions=False)
        logger.info(f"📢 Spoke error message")

        # Wait for message to complete before disconnecting
        await asyncio.sleep(3)

        # Hang up the SIP call by deleting the room
        logger.info("📞 Hanging up call - deleting room...")
        livekit_url = os.getenv("LIVEKIT_URL")
        livekit_api_key = os.getenv("LIVEKIT_API_KEY")
        livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_api = api.LiveKitAPI(livekit_url, livekit_api_key, livekit_api_secret)

        await livekit_api.room.delete_room(api.DeleteRoomRequest(room=ctx.room.name))
        logger.info("✅ Room deleted - call ended")

    except Exception as e:
        logger.error(f"Failed to speak error message: {e}", exc_info=True)
        # Try to delete room even on error
        try:
            livekit_url = os.getenv("LIVEKIT_URL")
            livekit_api_key = os.getenv("LIVEKIT_API_KEY")
            livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
            livekit_api = api.LiveKitAPI(livekit_url, livekit_api_key, livekit_api_secret)
            await livekit_api.room.delete_room(api.DeleteRoomRequest(room=ctx.room.name))
        except Exception:
            pass


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


async def get_dynamic_variables(agent_id: str, user_id: str) -> list:
    """Fetch dynamic variable definitions for extraction"""
    try:
        response = supabase.table("dynamic_variables") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        variables = response.data or []
        # Filter by agent_id if set, or include variables with no agent_id (global)
        if agent_id:
            variables = [v for v in variables if v.get("agent_id") is None or v.get("agent_id") == agent_id]

        logger.info(f"📊 Loaded {len(variables)} dynamic variables for extraction")
        return variables
    except Exception as e:
        logger.warning(f"Could not fetch dynamic variables: {e}")
        return []


async def extract_data_from_transcript(transcript_text: str, dynamic_variables: list) -> dict:
    """Use OpenAI to extract structured data from transcript based on variable definitions"""
    if not dynamic_variables or not transcript_text:
        return {}

    try:
        # Build extraction schema from variable definitions
        variables_schema = []
        for var in dynamic_variables:
            var_def = {
                "name": var["name"],
                "description": var.get("description", ""),
                "type": var.get("var_type", "text"),
            }
            if var.get("var_type") == "enum" and var.get("enum_options"):
                var_def["allowed_values"] = var["enum_options"]
            variables_schema.append(var_def)

        prompt = f"""Analyze this phone call transcript and extract the following information.
For each variable, provide a value based on what was discussed in the call.
If a value cannot be determined from the transcript, use null.

Variables to extract:
{json.dumps(variables_schema, indent=2)}

Transcript:
{transcript_text}

Respond with ONLY a valid JSON object containing the extracted values. Example:
{{"variable_name": "extracted value", "another_variable": true}}

For boolean variables, use true/false.
For number variables, use numeric values.
For enum variables, use one of the allowed values or null.
For text variables, use a string value."""

        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        extracted = json.loads(response.choices[0].message.content)
        logger.info(f"📊 Extracted data: {extracted}")
        return extracted

    except Exception as e:
        logger.error(f"Failed to extract data from transcript: {e}")
        return {}


async def generate_call_summary(transcript_text: str) -> str:
    """Generate a brief 3-sentence summary of the call"""
    if not transcript_text:
        return ""

    try:
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": f"""Summarize this phone call in exactly 3 short sentences. Focus on: who called, what they needed, and the outcome/next steps.

Transcript:
{transcript_text}

Provide only the 3-sentence summary, no additional text."""
            }],
            temperature=0.3,
            max_tokens=150,
        )

        summary = response.choices[0].message.content.strip()
        logger.info(f"📝 Generated call summary: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Failed to generate call summary: {e}")
        return ""


async def get_caller_memory(caller_phone: str, user_id: str, agent_id: str, memory_config: dict) -> str:
    """Retrieve conversation memory for a caller to inject into system prompt"""
    if not caller_phone or not user_id or not agent_id:
        return ""

    try:
        # Normalize phone number for lookup
        normalized_phone = re.sub(r'[^\d+]', '', caller_phone)
        if not normalized_phone.startswith('+'):
            normalized_phone = '+' + normalized_phone

        # Look up contact by phone number and user_id
        contact_response = supabase.table("contacts") \
            .select("id, name") \
            .eq("phone_number", normalized_phone) \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()

        if not contact_response.data or len(contact_response.data) == 0:
            logger.info(f"🧠 No contact found for {normalized_phone} - no memory to inject")
            return ""

        contact = contact_response.data[0]
        contact_id = contact["id"]
        contact_name = contact.get("name", "Unknown")

        # Get conversation context for this contact and agent
        context_response = supabase.table("conversation_contexts") \
            .select("*") \
            .eq("contact_id", contact_id) \
            .eq("agent_id", agent_id) \
            .limit(1) \
            .execute()

        if not context_response.data or len(context_response.data) == 0:
            logger.info(f"🧠 No conversation context found for contact {contact_id} with agent {agent_id}")
            return ""

        ctx = context_response.data[0]
        interaction_count = ctx.get("interaction_count", 0)

        if interaction_count == 0:
            logger.info(f"🧠 Contact {contact_name} has no previous interactions")
            return ""

        # Build memory context string based on config
        memory_parts = []
        memory_parts.append(f"## CALLER MEMORY")
        memory_parts.append(f"You have spoken with this caller ({contact_name}) {interaction_count} time(s) before.")

        # Include summary if configured
        if memory_config.get("include_summaries", True) and ctx.get("summary"):
            memory_parts.append(f"\nSummary of relationship: {ctx['summary']}")

        # Include key topics if configured
        if memory_config.get("include_key_topics", True) and ctx.get("key_topics"):
            topics = ctx["key_topics"]
            if isinstance(topics, list) and len(topics) > 0:
                memory_parts.append(f"\nKey topics discussed: {', '.join(topics)}")

        # Include preferences if configured
        if memory_config.get("include_preferences", True) and ctx.get("preferences"):
            prefs = ctx["preferences"]
            if isinstance(prefs, dict) and len(prefs) > 0:
                memory_parts.append(f"\nCaller preferences: {json.dumps(prefs)}")

        memory_parts.append("\nUse this context to provide personalized service. Reference past conversations naturally when relevant, but don't be creepy about it.")

        memory_context = "\n".join(memory_parts)
        logger.info(f"🧠 Loaded memory for {contact_name}: {interaction_count} interactions")

        return memory_context

    except Exception as e:
        logger.error(f"Failed to retrieve caller memory: {e}")
        return ""


async def generate_embedding(text: str) -> list:
    """Generate embedding vector for text using OpenAI"""
    if not text:
        return None

    try:
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        response = await client.embeddings.create(
            model="text-embedding-ada-002",
            input=text[:8000],  # Limit to ~8000 chars for ada-002
        )

        embedding = response.data[0].embedding
        logger.info(f"🔮 Generated embedding vector ({len(embedding)} dimensions)")
        return embedding

    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return None


async def search_similar_memories(query_text: str, agent_id: str, user_id: str, exclude_contact_id: str = None, config: dict = None) -> list:
    """Search for similar conversation memories using semantic similarity"""
    if not query_text or not agent_id or not user_id:
        return []

    config = config or {}
    max_results = config.get("max_results", 3)
    threshold = config.get("similarity_threshold", 0.75)

    try:
        # Generate embedding for query
        query_embedding = await generate_embedding(query_text)
        if not query_embedding:
            return []

        # Call the match_similar_memories function via RPC
        response = supabase.rpc("match_similar_memories", {
            "query_embedding": query_embedding,
            "match_agent_id": agent_id,
            "match_user_id": user_id,
            "exclude_contact_id": exclude_contact_id,
            "match_threshold": threshold,
            "match_count": max_results,
        }).execute()

        if response.data:
            logger.info(f"🔮 Found {len(response.data)} similar memories")
            return response.data
        return []

    except Exception as e:
        logger.error(f"Failed to search similar memories: {e}")
        return []


async def get_semantic_context(transcript_text: str, agent_id: str, user_id: str, current_contact_id: str = None, config: dict = None) -> str:
    """Get semantic context from similar past conversations"""
    if not transcript_text:
        return ""

    try:
        # Search for similar memories (excluding current caller)
        similar = await search_similar_memories(
            query_text=transcript_text,
            agent_id=agent_id,
            user_id=user_id,
            exclude_contact_id=current_contact_id,
            config=config
        )

        if not similar:
            return ""

        # Format similar memories for injection
        context_parts = ["## SIMILAR PAST CONVERSATIONS"]
        context_parts.append("Other callers have discussed similar topics:")

        for i, mem in enumerate(similar, 1):
            similarity_pct = int(mem.get("similarity", 0) * 100)
            context_parts.append(f"\n{i}. {mem.get('contact_name', 'A caller')} ({similarity_pct}% similar):")
            if mem.get("summary"):
                context_parts.append(f"   Summary: {mem['summary']}")
            if mem.get("key_topics"):
                topics = mem["key_topics"]
                if isinstance(topics, list) and len(topics) > 0:
                    context_parts.append(f"   Topics: {', '.join(topics[:5])}")

        context_parts.append("\nUse this context to identify patterns or common issues. Don't reference other callers directly.")

        return "\n".join(context_parts)

    except Exception as e:
        logger.error(f"Failed to get semantic context: {e}")
        return ""


async def update_caller_memory(caller_phone: str, user_id: str, agent_id: str, call_summary: str, call_record_id: str, transcript_text: str, generate_embedding_flag: bool = True) -> bool:
    """Update conversation memory for a caller after a call ends"""
    if not caller_phone or not user_id or not agent_id or not call_summary:
        logger.info(f"🧠 Skipping memory update - missing required data (phone={bool(caller_phone)}, user={bool(user_id)}, agent={bool(agent_id)}, summary={bool(call_summary)})")
        return False

    try:
        # Normalize phone number for lookup
        normalized_phone = re.sub(r'[^\d+]', '', caller_phone)
        if not normalized_phone.startswith('+'):
            normalized_phone = '+' + normalized_phone

        # Look up or create contact by phone number
        contact_response = supabase.table("contacts") \
            .select("id, name") \
            .eq("phone_number", normalized_phone) \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()

        if not contact_response.data or len(contact_response.data) == 0:
            # Create new contact for this caller
            logger.info(f"🧠 Creating new contact for {normalized_phone}")
            create_response = supabase.table("contacts") \
                .insert({
                    "user_id": user_id,
                    "phone_number": normalized_phone,
                    "name": f"Caller {normalized_phone[-4:]}",  # Use last 4 digits as placeholder name
                    "is_whitelisted": False,
                }) \
                .select() \
                .execute()

            if not create_response.data:
                logger.error(f"🧠 Failed to create contact for {normalized_phone}")
                return False
            contact = create_response.data[0]
        else:
            contact = contact_response.data[0]

        contact_id = contact["id"]
        contact_name = contact.get("name", "Unknown")

        # Extract key topics from transcript using OpenAI
        key_topics = []
        if transcript_text:
            try:
                client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                topics_response = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{
                        "role": "user",
                        "content": f"""Extract 3-5 key topics from this phone call transcript. Return ONLY a JSON array of short topic strings (2-4 words each).

Transcript:
{transcript_text[:3000]}

Example output: ["pricing inquiry", "product demo request", "technical support"]"""
                    }],
                    temperature=0.1,
                    max_tokens=100,
                )
                topics_text = topics_response.choices[0].message.content.strip()
                key_topics = json.loads(topics_text)
                logger.info(f"🧠 Extracted topics: {key_topics}")
            except Exception as e:
                logger.warning(f"🧠 Failed to extract topics: {e}")

        # Get existing conversation context or create new one
        context_response = supabase.table("conversation_contexts") \
            .select("*") \
            .eq("contact_id", contact_id) \
            .eq("agent_id", agent_id) \
            .limit(1) \
            .execute()

        if context_response.data and len(context_response.data) > 0:
            # Update existing context
            existing_ctx = context_response.data[0]
            existing_topics = existing_ctx.get("key_topics") or []
            existing_call_ids = existing_ctx.get("last_call_ids") or []

            # Merge topics (keep unique, limit to 10 most recent)
            merged_topics = list(dict.fromkeys(key_topics + existing_topics))[:10]

            # Keep last 5 call IDs
            updated_call_ids = ([call_record_id] + existing_call_ids)[:5] if call_record_id else existing_call_ids

            # Update summary by appending new info
            existing_summary = existing_ctx.get("summary") or ""
            if existing_summary:
                # Generate merged summary
                try:
                    client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                    merge_response = await client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{
                            "role": "user",
                            "content": f"""Merge these two relationship summaries into one concise paragraph (2-3 sentences max):

Previous summary: {existing_summary}

New call summary: {call_summary}

Keep the most important information. Focus on the overall relationship and key needs."""
                        }],
                        temperature=0.3,
                        max_tokens=150,
                    )
                    updated_summary = merge_response.choices[0].message.content.strip()
                except Exception as e:
                    logger.warning(f"🧠 Failed to merge summaries: {e}")
                    updated_summary = call_summary
            else:
                updated_summary = call_summary

            # Generate embedding for semantic search
            embedding = None
            if generate_embedding_flag and updated_summary:
                embedding_text = f"{updated_summary}\n\nTopics: {', '.join(merged_topics)}"
                embedding = await generate_embedding(embedding_text)

            update_data = {
                "summary": updated_summary,
                "key_topics": merged_topics,
                "interaction_count": (existing_ctx.get("interaction_count") or 0) + 1,
                "last_call_ids": updated_call_ids,
                "last_updated": datetime.datetime.now().isoformat(),
            }

            if embedding:
                update_data["embedding"] = embedding

            supabase.table("conversation_contexts") \
                .update(update_data) \
                .eq("id", existing_ctx["id"]) \
                .execute()

            logger.info(f"🧠 Updated memory for {contact_name}: now {(existing_ctx.get('interaction_count') or 0) + 1} interactions{' (with embedding)' if embedding else ''}")
        else:
            # Generate embedding for new context
            embedding = None
            if generate_embedding_flag and call_summary:
                embedding_text = f"{call_summary}\n\nTopics: {', '.join(key_topics)}"
                embedding = await generate_embedding(embedding_text)

            insert_data = {
                "contact_id": contact_id,
                "agent_id": agent_id,
                "summary": call_summary,
                "key_topics": key_topics,
                "interaction_count": 1,
                "last_call_ids": [call_record_id] if call_record_id else [],
            }

            if embedding:
                insert_data["embedding"] = embedding

            # Create new conversation context
            supabase.table("conversation_contexts") \
                .insert(insert_data) \
                .execute()

            logger.info(f"🧠 Created new memory for {contact_name}{' (with embedding)' if embedding else ''}")

        return True

    except Exception as e:
        logger.error(f"🧠 Failed to update caller memory: {e}")
        return False


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

        # Get phone number (support both 'number' and 'phone_number' keys)
        phone_number = transfer_config.get('number') or transfer_config.get('phone_number')
        if not phone_number:
            return f"No phone number configured for {transfer_config['label']}."

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
                        "To": phone_number,
                        "From": transfer_config.get('caller_id', ''),  # Use configured caller ID
                        "Url": f"{os.getenv('SUPABASE_URL')}/functions/v1/signalwire-transfer-handler",
                    }
                ) as resp:
                    if resp.status == 201:
                        logger.info(f"Successfully initiated transfer to {phone_number}")
                        return f"Transferring you to {transfer_config['label']} now. Please hold..."
                    else:
                        error_text = await resp.text()
                        logger.error(f"Transfer failed: {error_text}")
                        return f"I'm having trouble transferring your call. Let me take your information instead."

        except Exception as e:
            logger.error(f"Transfer error: {e}")
            return f"I'm having trouble transferring your call right now. Can I take a message instead?"

    return transfer_call


def create_warm_transfer_tools(user_id: str, transfer_numbers: list, room_name: str, service_number: str, caller_call_sid: str):
    """Create warm transfer tools for attended call transfers"""

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    @function_tool(description="Start a warm transfer - puts the caller on hold and dials the transfer destination so you can speak privately with them first. Use this when the caller asks to speak with someone specific.")
    async def start_warm_transfer(
        transfer_to: Annotated[str, "The label or name of who to transfer to (e.g., 'Sales', 'Rick', 'mobile')"]
    ):
        """Start a warm transfer by putting caller on hold and dialing the destination"""
        logger.info(f"🔄 Starting warm transfer to: {transfer_to}")

        # Find matching transfer number
        transfer_config = None
        for num in transfer_numbers:
            if num["label"].lower() == transfer_to.lower():
                transfer_config = num
                break

        if not transfer_config:
            available = ', '.join([n['label'] for n in transfer_numbers])
            return f"I don't have a transfer option for '{transfer_to}'. Available options are: {available}"

        phone_number = transfer_config.get('number') or transfer_config.get('phone_number')
        if not phone_number:
            return f"No phone number configured for {transfer_config['label']}."

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{supabase_url}/functions/v1/warm-transfer",
                    headers={
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "operation": "start",
                        "room_name": room_name,
                        "target_number": phone_number,
                        "target_label": transfer_config['label'],
                        "caller_call_sid": caller_call_sid,
                        "service_number": service_number,
                    }
                ) as resp:
                    result = await resp.json()
                    if result.get("success"):
                        logger.info(f"✅ Warm transfer started: {result}")
                        return f"The caller is now on hold. I'm connecting you with {transfer_config['label']}. Once they answer, you can brief them on the situation. Say 'complete transfer' when they're ready to take the call, or 'cancel transfer' if they can't take it."
                    else:
                        logger.error(f"Warm transfer failed: {result}")
                        return "I had trouble starting the transfer. Let me take a message instead."
        except Exception as e:
            logger.error(f"Warm transfer error: {e}")
            return "I'm having trouble with the transfer right now. Can I take a message instead?"

    @function_tool(description="Complete the warm transfer - bridges the caller with the transferee. Use this after speaking with the transferee and they agree to take the call.")
    async def complete_warm_transfer():
        """Complete the warm transfer by bridging all parties"""
        logger.info(f"🔄 Completing warm transfer for room: {room_name}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{supabase_url}/functions/v1/warm-transfer",
                    headers={
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "operation": "complete",
                        "room_name": room_name,
                    }
                ) as resp:
                    result = await resp.json()
                    if result.get("success"):
                        logger.info(f"✅ Warm transfer completed: {result}")
                        return "Transfer complete! The caller and transferee are now connected. You can end this call."
                    else:
                        logger.error(f"Complete transfer failed: {result}")
                        return "I had trouble completing the transfer. The caller is still on hold."
        except Exception as e:
            logger.error(f"Complete transfer error: {e}")
            return "I'm having trouble completing the transfer."

    @function_tool(description="Cancel the warm transfer - hangs up on the transferee and brings the caller back from hold. Use this if the transferee can't take the call.")
    async def cancel_warm_transfer():
        """Cancel the warm transfer and bring caller back"""
        logger.info(f"🔄 Cancelling warm transfer for room: {room_name}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{supabase_url}/functions/v1/warm-transfer",
                    headers={
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "operation": "cancel",
                        "room_name": room_name,
                    }
                ) as resp:
                    result = await resp.json()
                    if result.get("success"):
                        logger.info(f"✅ Warm transfer cancelled: {result}")
                        return "Transfer cancelled. The caller is back on the line. How else can I help them?"
                    else:
                        logger.error(f"Cancel transfer failed: {result}")
                        return "I had trouble cancelling the transfer."
        except Exception as e:
            logger.error(f"Cancel transfer error: {e}")
            return "I'm having trouble with the transfer."

    return [start_warm_transfer, complete_warm_transfer, cancel_warm_transfer]


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


def create_end_call_tool(room_name: str, description: str = None):
    """Create end call tool that allows the agent to hang up when appropriate"""

    tool_description = description or "End the phone call. Use this when the conversation is complete, the caller says goodbye, or there's nothing more to discuss."

    @function_tool(description=tool_description)
    async def end_call():
        """End the current phone call by disconnecting all participants"""
        logger.info(f"📞 Agent ending call for room: {room_name}")

        try:
            livekit_url = os.getenv("LIVEKIT_URL")
            livekit_api_key = os.getenv("LIVEKIT_API_KEY")
            livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
            livekit_api = api.LiveKitAPI(livekit_url, livekit_api_key, livekit_api_secret)

            await livekit_api.room.delete_room(api.DeleteRoomRequest(room=room_name))
            logger.info(f"✅ Call ended - room {room_name} deleted")
            return "Call ended successfully."
        except Exception as e:
            logger.error(f"Failed to end call: {e}")
            return "I had trouble ending the call."

    return end_call


def create_sms_tool(user_id: str, service_number: str, description: str = None, templates: list = None):
    """Create SMS tool that allows the agent to send text messages during calls"""

    tool_description = description or "Send an SMS text message to a phone number. Use this to send confirmations, follow-up information, or any text the caller requests."

    # Add templates to description if available - agent MUST use these exact messages
    if templates and len(templates) > 0:
        tool_description += "\n\nIMPORTANT: Use these pre-configured SMS templates when sending messages. Do NOT make up URLs or information - use ONLY the content from these templates:"
        for tmpl in templates:
            tool_description += f"\n- '{tmpl.get('name', 'Template')}': \"{tmpl.get('content', '')}\""

    @function_tool(description=tool_description)
    async def send_sms(
        to_number: Annotated[str, "The phone number to send the SMS to (e.g., '+14155551234' or the caller's number)"],
        message: Annotated[str, "The text message content to send"],
    ):
        """Send an SMS message via SignalWire"""
        logger.info(f"📱 Sending SMS to {to_number}: {message[:50]}...")

        try:
            signalwire_space = os.getenv("SIGNALWIRE_SPACE_URL", "erik.signalwire.com")
            signalwire_project = os.getenv("SIGNALWIRE_PROJECT_ID")
            signalwire_token = os.getenv("SIGNALWIRE_API_TOKEN")

            # Normalize phone number
            digits = ''.join(filter(str.isdigit, to_number))
            if len(digits) == 10:
                to_number = f"+1{digits}"
            elif len(digits) == 11 and digits.startswith('1'):
                to_number = f"+{digits}"

            async with aiohttp.ClientSession() as session:
                auth = aiohttp.BasicAuth(signalwire_project, signalwire_token)
                sms_url = f"https://{signalwire_space}/api/laml/2010-04-01/Accounts/{signalwire_project}/Messages.json"

                async with session.post(
                    sms_url,
                    auth=auth,
                    data={
                        "From": service_number,
                        "To": to_number,
                        "Body": message,
                    }
                ) as resp:
                    result = await resp.json()

                    if resp.status == 201:
                        logger.info(f"SMS sent successfully to {to_number}")

                        # Save to database
                        try:
                            supabase.table("sms_messages").insert({
                                "user_id": user_id,
                                "direction": "outgoing",
                                "service_number": service_number,
                                "contact_phone": to_number,
                                "message_body": message,
                                "is_ai_generated": True,
                                "status": "sent",
                            }).execute()
                        except Exception as db_err:
                            logger.error(f"Failed to save SMS to database: {db_err}")

                        return f"I've sent the text message to {to_number}."
                    else:
                        error_msg = result.get('message', 'Unknown error')
                        logger.error(f"SMS send failed: {error_msg}")
                        return "I had trouble sending that text message. Let me note the information instead."

        except Exception as e:
            logger.error(f"SMS error: {e}")
            return "I wasn't able to send the text message right now."

    return send_sms


def create_get_availability_tool(user_id: str, description: str = None):
    """Create tool to check calendar availability via Cal.com"""

    tool_description = description or "Check available appointment times. Use this when the caller wants to know when appointments are available."

    @function_tool(description=tool_description)
    async def get_availability(
        date: Annotated[str, "The date to check availability for (e.g., 'tomorrow', 'next Monday', '2024-01-15')"],
    ):
        """Get available appointment slots from Cal.com"""
        logger.info(f"📅 Checking availability for: {date}")

        try:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            # Parse the date - for simplicity, we'll check the next 7 days if relative
            today = datetime.datetime.now()

            # Simple date parsing
            if 'tomorrow' in date.lower():
                start_date = today + datetime.timedelta(days=1)
            elif 'next week' in date.lower():
                start_date = today + datetime.timedelta(days=7)
            else:
                # Try to parse as ISO date
                try:
                    start_date = datetime.datetime.fromisoformat(date.replace('Z', '+00:00'))
                except:
                    start_date = today + datetime.timedelta(days=1)

            end_date = start_date + datetime.timedelta(days=1)

            # Call our Cal.com edge function
            async with aiohttp.ClientSession() as session:
                # Get user's access token from database
                user_data = supabase.table("users").select("cal_com_access_token").eq("id", user_id).single().execute()

                if not user_data.data or not user_data.data.get("cal_com_access_token"):
                    return "I don't have access to the calendar right now. Would you like to leave your contact information instead?"

                # Use internal service call (bypasses JWT auth)
                async with session.post(
                    f"{supabase_url}/functions/v1/cal-com-get-slots",
                    headers={
                        "Authorization": f"Bearer {supabase_service_key}",
                        "Content-Type": "application/json",
                        "x-user-id": user_id,  # Pass user context
                    },
                    json={
                        "start": start_date.isoformat(),
                        "end": end_date.isoformat(),
                        "duration": 30,
                    }
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"Cal.com get-slots failed: {error_text}")
                        return "I'm having trouble checking the calendar. Can I take your information and have someone call you back?"

                    result = await resp.json()
                    slots = result.get("slots", [])

                    if not slots:
                        return f"I don't see any available times on {start_date.strftime('%A, %B %d')}. Would you like me to check another day?"

                    # Format slots for speech
                    slot_times = []
                    for slot in slots[:5]:  # Limit to 5 options
                        slot_time = datetime.datetime.fromisoformat(slot["start"].replace('Z', '+00:00'))
                        slot_times.append(slot_time.strftime("%-I:%M %p"))

                    slots_text = ", ".join(slot_times[:-1]) + f" or {slot_times[-1]}" if len(slot_times) > 1 else slot_times[0]
                    return f"On {start_date.strftime('%A, %B %d')}, I have openings at {slots_text}. Which time works best for you?"

        except Exception as e:
            logger.error(f"Get availability error: {e}")
            return "I'm having trouble accessing the calendar right now. Can I take your contact information instead?"

    return get_availability


def create_book_appointment_tool(user_id: str, description: str = None):
    """Create tool to book appointments via Cal.com"""

    tool_description = description or "Book an appointment for the caller. Use this after confirming the time with the caller."

    @function_tool(description=tool_description)
    async def book_appointment(
        date_time: Annotated[str, "The date and time for the appointment (e.g., '2024-01-15 2:00 PM' or 'tomorrow at 10am')"],
        attendee_name: Annotated[str, "The caller's name for the booking"],
        attendee_phone: Annotated[str, "The caller's phone number (optional)"] = "",
        attendee_email: Annotated[str, "The caller's email address (optional)"] = "",
        notes: Annotated[str, "Any notes or reason for the appointment (optional)"] = "",
    ):
        """Book an appointment in Cal.com"""
        logger.info(f"📅 Booking appointment for {attendee_name} at {date_time}")

        try:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            # Parse the datetime
            today = datetime.datetime.now()

            # Simple datetime parsing
            try:
                # Try ISO format first
                start_time = datetime.datetime.fromisoformat(date_time.replace('Z', '+00:00'))
            except:
                # Try common formats
                time_match = re.search(r'(\d{1,2}):?(\d{2})?\s*(am|pm)?', date_time.lower())
                if time_match:
                    hour = int(time_match.group(1))
                    minute = int(time_match.group(2) or 0)
                    ampm = time_match.group(3)
                    if ampm == 'pm' and hour != 12:
                        hour += 12
                    elif ampm == 'am' and hour == 12:
                        hour = 0

                    if 'tomorrow' in date_time.lower():
                        start_time = (today + datetime.timedelta(days=1)).replace(hour=hour, minute=minute, second=0, microsecond=0)
                    else:
                        start_time = today.replace(hour=hour, minute=minute, second=0, microsecond=0)
                        if start_time < today:
                            start_time += datetime.timedelta(days=1)
                else:
                    return "I couldn't understand that time. Could you please specify the time again, like '2 PM tomorrow'?"

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{supabase_url}/functions/v1/cal-com-create-booking",
                    headers={
                        "Authorization": f"Bearer {supabase_service_key}",
                        "Content-Type": "application/json",
                        "x-user-id": user_id,
                    },
                    json={
                        "start": start_time.isoformat(),
                        "title": f"Appointment with {attendee_name}",
                        "attendee_name": attendee_name,
                        "attendee_phone": attendee_phone,
                        "attendee_email": attendee_email,
                        "notes": notes,
                    }
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"Cal.com booking failed: {error_text}")
                        try:
                            error_json = json.loads(error_text)
                            error_msg = error_json.get("error", "Unknown error")
                            if "slot" in error_msg.lower() or "unavailable" in error_msg.lower():
                                return "I'm sorry, that time slot is no longer available. Would you like to try a different time?"
                        except:
                            pass
                        return "I had trouble booking that appointment. Would you like to try a different time?"

                    result = await resp.json()
                    booking = result.get("booking", {})

                    # Format confirmation
                    booked_time = datetime.datetime.fromisoformat(booking.get("start", start_time.isoformat()).replace('Z', '+00:00'))
                    formatted_time = booked_time.strftime("%A, %B %d at %-I:%M %p")

                    logger.info(f"Appointment booked: {booking.get('id')}")
                    return f"I've booked your appointment for {formatted_time}. You're all set, {attendee_name}!"

        except Exception as e:
            logger.error(f"Book appointment error: {e}")
            return "I wasn't able to complete the booking. Can I take your information and have someone confirm the appointment with you?"

    return book_appointment


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


# ============================================
# Custom Function Factory
# ============================================

async def get_custom_functions(agent_id: str) -> list:
    """Fetch active custom functions for an agent from database"""
    try:
        response = supabase.table("custom_functions") \
            .select("*") \
            .eq("agent_id", agent_id) \
            .eq("is_active", True) \
            .execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching custom functions: {e}")
        return []


def extract_json_path(data: dict, path: str):
    """Simple JSON path extraction (supports $.key.subkey format)"""
    try:
        if not path or not path.startswith('$'):
            return None

        # Remove leading $. and split by dots
        keys = path.lstrip('$.').split('.')
        result = data

        for key in keys:
            if isinstance(result, dict):
                result = result.get(key)
            elif isinstance(result, list) and key.isdigit():
                result = result[int(key)]
            else:
                return None

        return result
    except Exception:
        return None


def create_custom_function_tool(func_config: dict, webhook_secret: str = None):
    """Create a LiveKit function_tool from custom function configuration"""
    func_name = func_config['name']
    func_description = func_config['description']
    http_method = func_config['http_method']
    endpoint_url = func_config['endpoint_url']
    headers_config = func_config.get('headers') or []
    body_schema = func_config.get('body_schema') or []
    response_variables = func_config.get('response_variables') or []
    timeout_ms = func_config.get('timeout_ms') or 120000
    max_retries = func_config.get('max_retries') or 2

    # Build parameter annotations for the function based on body_schema
    # For now, we'll accept kwargs and validate against schema
    param_descriptions = []
    for param in body_schema:
        required_str = " (required)" if param.get('required') else ""
        param_descriptions.append(f"- {param['name']}: {param.get('description', 'No description')}{required_str}")

    full_description = func_description
    if param_descriptions:
        full_description += "\n\nParameters:\n" + "\n".join(param_descriptions)

    @function_tool(description=full_description)
    async def custom_function(
        parameters: Annotated[str, "JSON string of parameters to pass to the function"]
    ):
        """Execute a custom webhook function"""
        logger.info(f"🔧 Custom function '{func_name}' called with parameters: {parameters}")

        try:
            # Parse parameters
            params = {}
            if parameters:
                try:
                    params = json.loads(parameters)
                except json.JSONDecodeError:
                    # Try to extract key-value pairs from natural language
                    logger.warning(f"Failed to parse parameters as JSON: {parameters}")
                    params = {"raw_input": parameters}

            # Validate required parameters
            missing_required = []
            for param_def in body_schema:
                if param_def.get('required') and param_def['name'] not in params:
                    missing_required.append(param_def['name'])

            if missing_required:
                return f"Missing required information: {', '.join(missing_required)}. Please provide these values."

            # Build headers
            headers = {'Content-Type': 'application/json'}

            # Add request signing if webhook_secret is provided
            if webhook_secret:
                timestamp = str(int(time_module.time()))
                payload_str = json.dumps(params, sort_keys=True)
                signature = hmac.new(
                    webhook_secret.encode(),
                    f"{timestamp}.{payload_str}".encode(),
                    hashlib.sha256
                ).hexdigest()
                headers['X-Magpipe-Timestamp'] = timestamp
                headers['X-Magpipe-Signature'] = signature

            # Add custom headers from config
            for h in headers_config:
                if h.get('name') and h.get('value'):
                    headers[h['name']] = h['value']

            # Make HTTP request with retries
            timeout = aiohttp.ClientTimeout(total=timeout_ms / 1000)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                for attempt in range(max_retries + 1):
                    try:
                        if http_method == 'GET':
                            async with session.get(endpoint_url, params=params, headers=headers) as resp:
                                result = await resp.json()
                        else:
                            async with session.request(http_method, endpoint_url, json=params, headers=headers) as resp:
                                result = await resp.json()

                        logger.info(f"🔧 Custom function '{func_name}' response: {result}")

                        # Extract response variables if configured
                        if response_variables:
                            extracted = {}
                            for var in response_variables:
                                value = extract_json_path(result, var.get('json_path', ''))
                                if value is not None:
                                    extracted[var['name']] = value

                            if extracted:
                                return f"Function completed successfully. Results: {json.dumps(extracted)}"

                        # Return full response if no variables to extract
                        if isinstance(result, dict):
                            # Try to find a message or status in the response
                            for key in ['message', 'result', 'status', 'data']:
                                if key in result:
                                    return f"Function completed. {key.capitalize()}: {result[key]}"
                            return f"Function completed successfully."
                        return f"Function completed. Response: {result}"

                    except aiohttp.ClientError as e:
                        logger.error(f"Request attempt {attempt + 1} failed: {e}")
                        if attempt == max_retries:
                            return "I'm having trouble completing that request. Please try again later."
                        await asyncio.sleep(1)  # Brief delay before retry

        except Exception as e:
            logger.error(f"Custom function '{func_name}' error: {e}")
            return "I encountered an error processing that request."

    # Set the function name for the tool registry
    custom_function.__name__ = func_name
    custom_function.__qualname__ = func_name

    return custom_function


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
    service_number = room_metadata.get("service_number")
    caller_number = None
    fast_path_complete = False
    user_config = None
    voice_config = None
    transfer_numbers = []
    dynamic_variables = []

    # Get user_id and direction from metadata (outbound calls have these)
    user_id = room_metadata.get("user_id")
    direction = room_metadata.get("direction")
    contact_phone = room_metadata.get("contact_phone")
    # Template context for outbound calls
    call_purpose = None
    call_goal = None

    # FAST PATH for outbound calls with complete metadata
    if user_id and direction == "outbound":
        logger.info("🚀 FAST PATH: Outbound call with full metadata - skipping lookups")

        # Connect to room
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        logger.info("✅ Connected to LiveKit room")

        # Log connection
        log_call_state(ctx.room.name, 'agent_connected', 'agent', {
            'room_name': ctx.room.name,
            'auto_subscribe': 'AUDIO_ONLY',
            'fast_path': True,
        })

        # Fetch user config, voice config, and transfer numbers in PARALLEL
        logger.info("⚡ Fetching configs in parallel...")
        user_config_task = get_user_config(room_metadata)

        user_config = await user_config_task
        if not user_config:
            logger.warning(f"No agent assigned for this number")
            await speak_error_and_disconnect(ctx, "This number is not currently assigned. Go to Magpipe.ai to assign your number.")
            return

        # Get voice config, transfer numbers, and dynamic variables in parallel
        voice_id = user_config.get("voice_id", "11labs-Rachel")
        agent_id = user_config.get("id")
        voice_config_task = get_voice_config(voice_id, user_id)
        dynamic_vars_task = get_dynamic_variables(agent_id, user_id)

        async def get_transfer_nums():
            resp = supabase.table("transfer_numbers").select("*").eq("user_id", user_id).execute()
            return resp.data or []

        transfer_task = get_transfer_nums()

        voice_config, transfer_numbers, dynamic_variables = await asyncio.gather(
            voice_config_task, transfer_task, dynamic_vars_task
        )

        logger.info(f"✅ Configs loaded - proceeding to session start")

        # Skip to session creation (jump past inbound logic)
        admin_check_info = None
        fast_path_complete = True

    else:
        # STANDARD PATH for inbound calls - need to look up user from SIP participant

        # Connect to room first
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        logger.info("✅ Connected to LiveKit room")

        # Log: Agent connected to room
        log_call_state(ctx.room.name, 'agent_connected', 'agent', {
            'room_name': ctx.room.name,
            'auto_subscribe': 'AUDIO_ONLY',
        })

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
            # Look up user and agent from service_numbers table (SignalWire numbers)
            response = supabase.table("service_numbers") \
                .select("user_id, agent_id") \
                .eq("phone_number", service_number) \
                .eq("is_active", True) \
                .limit(1) \
                .execute()

            if response.data and len(response.data) > 0:
                user_id = response.data[0]["user_id"]
                agent_id = response.data[0].get("agent_id")
                room_metadata["user_id"] = user_id
                if agent_id:
                    room_metadata["agent_id"] = agent_id
                    logger.info(f"Looked up user_id: {user_id}, agent_id: {agent_id} from service_numbers")
                else:
                    logger.info(f"Looked up user_id from service_numbers: {user_id} (no specific agent)")
            else:
                # Not found in service_numbers - check external_sip_numbers (Twilio, etc.)
                logger.info(f"Number not in service_numbers, checking external_sip_numbers: {service_number}")
                ext_response = supabase.table("external_sip_numbers") \
                    .select("user_id") \
                    .eq("phone_number", service_number) \
                    .eq("is_active", True) \
                    .limit(1) \
                    .execute()

                if ext_response.data and len(ext_response.data) > 0:
                    user_id = ext_response.data[0]["user_id"]
                    room_metadata["user_id"] = user_id
                    logger.info(f"Looked up user_id from external_sip_numbers: {user_id}")

                    # For Twilio external trunk inbound calls, create call_record from LiveKit data
                    if call_sid and service_number and user_id:
                        # Get caller phone number from SIP participant attributes
                        sip_caller_number = None
                        for participant in ctx.room.remote_participants.values():
                            attrs = participant.attributes
                            logger.info(f"📞 SIP participant attributes: {attrs}")
                            # Try various SIP attribute names for caller number
                            sip_caller_number = (
                                attrs.get("sip.remoteUri") or
                                attrs.get("sip.from") or
                                attrs.get("sip.caller") or
                                participant.identity
                            )
                            if sip_caller_number:
                                # Clean up SIP URI/identity format to get phone number
                                # Formats: "sip:+16041234567@...", "sip_+16041234567", "+16041234567"
                                if sip_caller_number.startswith("sip:"):
                                    sip_caller_number = sip_caller_number[4:]
                                if sip_caller_number.startswith("sip_"):
                                    sip_caller_number = sip_caller_number[4:]
                                if "@" in sip_caller_number:
                                    sip_caller_number = sip_caller_number.split("@")[0]
                                # Ensure it starts with + for E.164 format
                                if sip_caller_number and not sip_caller_number.startswith("+"):
                                    sip_caller_number = "+" + sip_caller_number
                                logger.info(f"📞 Extracted caller number from SIP: {sip_caller_number}")
                                break

                        logger.info(f"Creating call_record for Twilio inbound call: {call_sid}")

                        # Insert call record for Twilio inbound
                        insert_response = supabase.table("call_records") \
                            .insert({
                                "user_id": user_id,
                                "caller_number": sip_caller_number or "unknown",
                                "contact_phone": sip_caller_number or "unknown",
                                "service_number": service_number,
                                "call_sid": call_sid,
                                "livekit_call_id": call_sid,
                                "direction": "inbound",
                                "status": "in-progress",
                                "disposition": "answered_by_pat",
                                "telephony_vendor": "twilio",
                                "call_source": "external_trunk",
                                "started_at": datetime.datetime.utcnow().isoformat(),
                            }) \
                            .execute()

                        if insert_response.data and len(insert_response.data) > 0:
                            logger.info(f"✅ Created call_record for Twilio inbound call")
                        else:
                            logger.warning(f"⚠️ Could not create call_record for Twilio inbound")
                else:
                    # SignalWire numbers - update existing record with livekit_call_id
                    if call_sid and service_number and user_id:
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
        logger.warning("Could not determine user_id - number not found or inactive")
        await speak_error_and_disconnect(ctx, "This number is not currently assigned. Go to Magpipe.ai to assign your number.")
        return

    # Get direction from metadata or database to determine agent role (MUST be before admin check)
    direction = room_metadata.get("direction")
    contact_phone = room_metadata.get("contact_phone")

    # Log direction detection start
    log_call_state(ctx.room.name, "direction_detection_start", "agent", {
        "metadata_direction": direction,
        "metadata_contact_phone": contact_phone,
        "user_id": user_id,
        "service_number": service_number,
    })

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
                    .select("direction, contact_phone, call_purpose, call_goal") \
                    .eq("service_number", service_number) \
                    .eq("user_id", user_id) \
                    .gte("created_at", one_minute_ago) \
                    .order("created_at", desc=True) \
                    .limit(1) \
                    .execute()

                # Log the lookup result
                log_call_state(ctx.room.name, "direction_lookup_with_service_number", "agent", {
                    "service_number": service_number,
                    "user_id": user_id,
                    "since": one_minute_ago,
                    "found_records": len(call_lookup.data) if call_lookup and call_lookup.data else 0,
                    "result": call_lookup.data[0] if call_lookup and call_lookup.data else None,
                })

            # If no match, try without service_number (for bridged outbound where LiveKit trunk number != caller_id)
            if not call_lookup or not call_lookup.data or len(call_lookup.data) == 0:
                logger.info(f"📊 No match with service_number, trying without (for bridged outbound)")
                call_lookup = supabase.table("call_records") \
                    .select("direction, contact_phone, service_number, call_purpose, call_goal") \
                    .eq("user_id", user_id) \
                    .gte("created_at", one_minute_ago) \
                    .order("created_at", desc=True) \
                    .limit(1) \
                    .execute()

                # Log fallback lookup result
                log_call_state(ctx.room.name, "direction_lookup_without_service_number", "agent", {
                    "user_id": user_id,
                    "since": one_minute_ago,
                    "found_records": len(call_lookup.data) if call_lookup and call_lookup.data else 0,
                    "result": call_lookup.data[0] if call_lookup and call_lookup.data else None,
                })

            if call_lookup.data and len(call_lookup.data) > 0:
                direction = call_lookup.data[0].get("direction", "inbound")
                if not contact_phone:
                    contact_phone = call_lookup.data[0].get("contact_phone")
                found_service_number = call_lookup.data[0].get("service_number")
                # Get call purpose and goal for outbound calls
                call_purpose = call_lookup.data[0].get("call_purpose")
                call_goal = call_lookup.data[0].get("call_goal")
                logger.info(f"📊 Found call direction from database: {direction}, contact_phone: {contact_phone}, service_number: {found_service_number}")
                if call_purpose or call_goal:
                    logger.info(f"📋 Call template context: purpose='{call_purpose}', goal='{call_goal}'")
            else:
                logger.warning(f"📊 No recent call found for user_id={user_id}")
        except Exception as e:
            logger.warning(f"Could not look up call direction: {e}")
            log_call_state(ctx.room.name, "direction_lookup_error", "agent", {
                "error": str(e),
            })
            direction = "inbound"  # Default to inbound if lookup fails

    if not direction:
        direction = "inbound"  # Final fallback

    # Log final direction
    log_call_state(ctx.room.name, "direction_detected", "agent", {
        "direction": direction,
        "contact_phone": contact_phone,
    })

    logger.info(f"📞 Call direction: {direction}")
    logger.info(f"📞 Contact phone: {contact_phone}")

    # Store admin check info for later (after session is created)
    admin_check_info = None
    if direction != "outbound" and caller_number:
        logger.info(f"🔐 Checking phone admin access for caller: {caller_number}")
        admin_check_info = await check_phone_admin_access(caller_number)
        if admin_check_info.get("has_access"):
            logger.info(f"📱 Admin access possible for: {admin_check_info.get('full_name')}")

    # Get user configuration (skip if already fetched in fast path)
    log_call_state(ctx.room.name, "getting_user_config", "agent", {
        "fast_path_complete": fast_path_complete,
        "room_metadata_keys": list(room_metadata.keys()),
        "user_id_in_metadata": room_metadata.get("user_id"),
        "agent_id_in_metadata": room_metadata.get("agent_id"),
    })

    if not fast_path_complete:
        user_config = await get_user_config(room_metadata)
        if not user_config:
            logger.warning(f"No agent assigned for this number")
            await speak_error_and_disconnect(ctx, "This number is not currently assigned. Go to Magpipe.ai to assign your number.")
            return

        # Check if this is the system agent (for unassigned numbers)
        SYSTEM_AGENT_ID = "00000000-0000-0000-0000-000000000002"
        agent_id_str = str(user_config.get("id", "")).lower()
        agent_name = user_config.get("name", "")
        logger.info(f"🔍 Agent loaded: name='{agent_name}', id='{agent_id_str}'")
        logger.info(f"🔍 Comparing to system agent: '{SYSTEM_AGENT_ID}'")
        # Check by ID or by name (System - Not Assigned)
        is_system_agent = agent_id_str == SYSTEM_AGENT_ID or agent_name == "System - Not Assigned"
        if is_system_agent:
            logger.info("🔔 System agent detected - speaking greeting and disconnecting")
            greeting = user_config.get("greeting_template", "This number is not currently assigned.")
            await speak_error_and_disconnect(ctx, greeting)
            return

        user_id = user_config["user_id"]
        logger.info(f"Loaded config for user: {user_id}")

        log_call_state(ctx.room.name, "user_config_loaded", "agent", {
            "user_id": user_id,
            "agent_name": user_config.get("name"),
            "agent_id": str(user_config.get("id")),
        })

        # Get voice configuration
        voice_id = user_config.get("voice_id", "11labs-Rachel")
        voice_config = await get_voice_config(voice_id, user_id)

        # Get transfer numbers
        transfer_numbers_response = supabase.table("transfer_numbers") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        transfer_numbers = transfer_numbers_response.data or []

        # Get dynamic variables for extraction
        agent_id = user_config.get("id")
        dynamic_variables = await get_dynamic_variables(agent_id, user_id)
    else:
        logger.info("⚡ Using pre-fetched configs from fast path")

    # Get greeting message and base prompt
    base_prompt = user_config.get("system_prompt", "You are Pat, a helpful AI assistant answering calls for a business. The caller is a customer - treat them professionally and helpfully.")

    # Different prompts and behavior based on call direction
    if direction == "outbound":
        # OUTBOUND: Agent is calling someone on behalf of the owner
        greeting = ""  # Don't greet - wait for destination to answer

        # Use outbound_system_prompt if configured, otherwise use a default
        outbound_prompt = user_config.get("outbound_system_prompt")

        if outbound_prompt:
            system_prompt = outbound_prompt
            logger.info("🔄 Outbound call - Using user's configured outbound prompt")
        else:
            # Default outbound prompt when user hasn't configured one
            agent_name = user_config.get("agent_name", "Pat")
            system_prompt = f"""You are {agent_name}, an AI assistant making an outbound phone call on behalf of your owner.

THIS IS AN OUTBOUND CALL:
- You called them, they did not call you
- They will answer with "Hello?" - then you introduce yourself and explain why you're calling
- Do NOT ask "how can I help you" - you called them, not the other way around
- Be conversational, professional, and respectful of their time
- If they're busy or not interested, be gracious and end the call politely"""
            logger.info("🔄 Outbound call - Using default outbound prompt")

        # Append call purpose and goal context if provided (from outbound template)
        if call_purpose or call_goal or contact_phone:
            template_context = "\n\nCALL CONTEXT:"
            if contact_phone:
                template_context += f"\n- You are calling: {contact_phone}"
            if call_purpose:
                template_context += f"\n- Purpose: {call_purpose}"
            if call_goal:
                template_context += f"\n- Goal: {call_goal}"
            template_context += "\n\nFocus on achieving the stated goal while being natural and conversational."
            system_prompt = system_prompt + template_context
            logger.info(f"📋 Added template context to outbound prompt: contact='{contact_phone}', purpose='{call_purpose}', goal='{call_goal}'")
    else:
        # INBOUND: Agent handles the call for the user (traditional behavior)
        greeting = user_config.get("greeting_template", "Hello! This is Pat. How can I help you today?")

        # Get the actual caller phone number for the prompt
        # Try sip_caller_number first, then caller_number, then parse from participants
        actual_caller_phone = None
        for participant in ctx.room.remote_participants.values():
            attrs = participant.attributes
            # Extract from SIP attributes
            sip_phone = (
                attrs.get("sip.remoteUri") or
                attrs.get("sip.from") or
                attrs.get("sip.caller") or
                participant.identity
            )
            if sip_phone:
                # Clean up SIP URI format
                if sip_phone.startswith("sip:"):
                    sip_phone = sip_phone[4:]
                if sip_phone.startswith("sip_"):
                    sip_phone = sip_phone[4:]
                if "@" in sip_phone:
                    sip_phone = sip_phone.split("@")[0]
                if sip_phone and not sip_phone.startswith("+"):
                    sip_phone = "+" + sip_phone
                actual_caller_phone = sip_phone
                break

        caller_phone_info = f"\n- The caller's phone number is: {actual_caller_phone}" if actual_caller_phone else ""

        # Put role clarification FIRST, then user's prompt, then call context
        INBOUND_ROLE_PREFIX = f"""CRITICAL - UNDERSTAND YOUR ROLE:
The person on this call is a CALLER/CUSTOMER calling in - they are NOT the business owner.
- You work for the business owner (your boss) who configured you
- The CALLER is a customer/client reaching out to the business
- Do NOT treat the caller as your boss or as if they set you up
- Do NOT say "your assistant" or "your number" to them - you're not THEIR assistant
- Treat every caller professionally as a potential customer{caller_phone_info}

YOUR CONFIGURED PERSONALITY:
"""

        INBOUND_CONTEXT_SUFFIX = """

CALL CONTEXT:
- This is a LIVE VOICE CALL with a customer calling in
- Speak naturally and conversationally
- Be warm, friendly, and professional
- You can transfer calls, take messages, or help customers directly"""

        system_prompt = f"{INBOUND_ROLE_PREFIX}{base_prompt}{INBOUND_CONTEXT_SUFFIX}"
        logger.info("📥 Inbound call - Agent handling customer service")

    logger.info(f"Voice system prompt applied for {direction} call")

    # Inject caller memory if memory is enabled for this agent
    agent_id = user_config.get("id")
    current_contact_id = None  # Will be set if we find the caller's contact

    if user_config.get("memory_enabled"):
        memory_config = user_config.get("memory_config") or {
            "max_history_calls": 5,
            "include_summaries": True,
            "include_key_topics": True,
            "include_preferences": True
        }

        # Get the remote party's phone number
        # For outbound: use contact_phone (the person we're calling)
        # For inbound: use actual_caller_phone (the person who called us)
        if direction == "outbound":
            memory_caller_phone = contact_phone
        else:
            # actual_caller_phone is set in the inbound block above
            memory_caller_phone = locals().get('actual_caller_phone')

        if memory_caller_phone and agent_id:
            memory_context = await get_caller_memory(memory_caller_phone, user_id, agent_id, memory_config)
            if memory_context:
                system_prompt = f"{system_prompt}\n\n{memory_context}"
                logger.info(f"🧠 Memory context injected into system prompt")

                # Get contact_id for semantic search exclusion
                normalized_phone = re.sub(r'[^\d+]', '', memory_caller_phone)
                if not normalized_phone.startswith('+'):
                    normalized_phone = '+' + normalized_phone
                contact_lookup = supabase.table("contacts").select("id").eq("phone_number", normalized_phone).eq("user_id", user_id).limit(1).execute()
                if contact_lookup.data:
                    current_contact_id = contact_lookup.data[0]["id"]
        else:
            logger.info(f"🧠 Memory enabled but no caller phone available (phone={memory_caller_phone}, agent_id={agent_id})")

    # Inject semantic memory context (similar past conversations) if enabled
    if user_config.get("semantic_memory_enabled") and agent_id:
        semantic_config = user_config.get("semantic_memory_config") or {
            "max_results": 3,
            "similarity_threshold": 0.75,
            "include_other_callers": True
        }

        # For semantic search at call start, we use the caller's existing memory summary
        # to find similar conversations with OTHER callers
        if current_contact_id:
            # Get this caller's memory to use as search query
            ctx_response = supabase.table("conversation_contexts").select("summary, key_topics").eq("contact_id", current_contact_id).eq("agent_id", agent_id).limit(1).execute()
            if ctx_response.data and ctx_response.data[0].get("summary"):
                caller_summary = ctx_response.data[0]["summary"]
                caller_topics = ctx_response.data[0].get("key_topics") or []
                search_text = f"{caller_summary}\n\nTopics: {', '.join(caller_topics)}"

                semantic_context = await get_semantic_context(
                    transcript_text=search_text,
                    agent_id=agent_id,
                    user_id=user_id,
                    current_contact_id=current_contact_id,
                    config=semantic_config
                )

                if semantic_context:
                    system_prompt = f"{system_prompt}\n\n{semantic_context}"
                    logger.info(f"🔮 Semantic context injected into system prompt")
        else:
            logger.info(f"🔮 Semantic memory enabled but no existing caller context to search from")

    # Already connected earlier to get service number, don't connect again in session.start

    # Load custom functions for this agent
    custom_tools = []
    if agent_id:
        custom_function_configs = await get_custom_functions(agent_id)
        if custom_function_configs:
            logger.info(f"🔧 Loading {len(custom_function_configs)} custom functions for agent {agent_id}")
            # Get webhook secret from environment (optional)
            webhook_secret = os.getenv("CUSTOM_FUNCTION_WEBHOOK_SECRET")
            for func_config in custom_function_configs:
                try:
                    tool = create_custom_function_tool(func_config, webhook_secret)
                    custom_tools.append(tool)
                    logger.info(f"🔧 Registered custom function: {func_config['name']}")
                except Exception as e:
                    logger.error(f"Failed to create custom function '{func_config['name']}': {e}")
        else:
            logger.info(f"🔧 No custom functions configured for agent {agent_id}")

    # Add system function tools based on functions config
    functions_config = user_config.get("functions", {}) if user_config else {}

    # End Call function (default: enabled)
    end_call_config = functions_config.get("end_call", {})
    end_call_enabled = end_call_config.get("enabled", True)  # Default enabled
    if end_call_enabled:
        end_call_description = end_call_config.get("description")
        end_call_tool = create_end_call_tool(ctx.room.name, end_call_description)
        custom_tools.append(end_call_tool)
        logger.info(f"📞 Registered end_call tool for room {ctx.room.name}")

    # Transfer function
    transfer_config = functions_config.get("transfer", {})
    transfer_enabled = transfer_config.get("enabled", False)
    if transfer_enabled:
        # Get transfer numbers from functions.transfer.numbers, or fall back to table
        transfer_nums = transfer_config.get("numbers", [])
        if not transfer_nums and transfer_numbers:
            # Fall back to transfer_numbers table (backwards compatibility)
            transfer_nums = [{"phone_number": n.get("phone_number"), "label": n.get("label", "Transfer"), "description": n.get("description", "")} for n in transfer_numbers]
        if transfer_nums:
            # Add warm transfer tools (for attended transfers)
            warm_transfer_tools = create_warm_transfer_tools(
                user_id=user_id,
                transfer_numbers=transfer_nums,
                room_name=ctx.room.name,
                service_number=service_number or '',
                caller_call_sid=call_sid or ''
            )
            custom_tools.extend(warm_transfer_tools)
            logger.info(f"📞 Registered warm transfer tools with {len(transfer_nums)} numbers")

    # SMS function
    sms_config = functions_config.get("sms", {})
    sms_enabled = sms_config.get("enabled", False)
    if sms_enabled and service_number:
        sms_description = sms_config.get("description")
        # Load SMS templates for this user
        sms_templates = []
        try:
            templates_result = supabase.table("sms_templates").select("name, content").eq("user_id", user_id).execute()
            if templates_result.data:
                sms_templates = templates_result.data
                logger.info(f"📱 Loaded {len(sms_templates)} SMS templates")
        except Exception as e:
            logger.warning(f"Could not load SMS templates: {e}")
        sms_tool = create_sms_tool(user_id, service_number, sms_description, sms_templates)
        custom_tools.append(sms_tool)
        logger.info(f"📱 Registered SMS tool for service number {service_number}")

    # Booking function (get_availability + book_appointment)
    booking_config = functions_config.get("booking", {})
    booking_enabled = booking_config.get("enabled", False)
    if booking_enabled:
        # Check if user has Cal.com connected
        user_cal_check = supabase.table("users").select("cal_com_access_token").eq("id", user_id).single().execute()
        if user_cal_check.data and user_cal_check.data.get("cal_com_access_token"):
            # Get availability tool
            get_avail_config = booking_config.get("get_availability", {})
            if get_avail_config.get("enabled", True):  # Default enabled if booking is enabled
                availability_tool = create_get_availability_tool(user_id, get_avail_config.get("description"))
                custom_tools.append(availability_tool)
                logger.info(f"📅 Registered get_availability tool")

            # Book appointment tool
            book_description = booking_config.get("description")
            book_tool = create_book_appointment_tool(user_id, book_description)
            custom_tools.append(book_tool)
            logger.info(f"📅 Registered book_appointment tool")
        else:
            logger.warning(f"⚠️ Booking enabled but Cal.com not connected for user {user_id}")

    # Extract Data function
    extract_config = functions_config.get("extract_data", {})
    extract_enabled = extract_config.get("enabled", False)
    if extract_enabled:
        collect_data_tool = create_collect_data_tool(user_id)
        custom_tools.append(collect_data_tool)
        logger.info(f"📝 Registered extract_data/collect tool")

    # Create Agent instance with custom function tools
    if custom_tools:
        assistant = Agent(instructions=system_prompt, tools=custom_tools)
        logger.info(f"🔧 Agent created with {len(custom_tools)} custom function tools")
    else:
        assistant = Agent(instructions=system_prompt)

    # Get LLM model from config (default to gpt-4.1-nano for lowest latency)
    llm_model = user_config.get("llm_model", "gpt-4.1-nano") if user_config else "gpt-4.1-nano"

    # Get voice settings from voice_config (or use defaults)
    tts_voice_id = voice_config.get("voice_id", "21m00Tcm4TlvDq8ikWAM") if voice_config else "21m00Tcm4TlvDq8ikWAM"

    logger.info(f"🎙️ Using LLM: {llm_model}, Voice: {tts_voice_id}")

    # Initialize AgentSession with low-latency configuration
    # VAD tuning: instant response with background noise filtering
    session = AgentSession(
        vad=silero.VAD.load(
            min_silence_duration=0.0,   # Respond immediately when speech stops
            min_speech_duration=0.15,   # Require slightly longer speech to trigger
            activation_threshold=0.6,   # Higher = less sensitive to background noise (default 0.5)
        ),
        stt=deepgram.STT(
            model="nova-2-phonecall",
            language="en-US",
        ),
        llm=lkopenai.LLM(
            model=llm_model,
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            model="eleven_flash_v2_5",  # Fastest ElevenLabs model
            voice_id=tts_voice_id,
            api_key=os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_API_KEY"),
            chunk_length_schedule=[50, 80, 120, 150],  # Smaller chunks for faster first audio
        ),
    )

    # Track egress (recording) ID
    egress_id = None

    # Latency tracking
    latency_start_time = None

    # Track user speech start for latency measurement
    @session.on("user_started_speaking")
    def on_user_started_speaking():
        nonlocal latency_start_time
        latency_start_time = asyncio.get_event_loop().time()
        logger.info(f"⏱️ [LATENCY] User started speaking at {latency_start_time:.3f}")

    @session.on("user_stopped_speaking")
    def on_user_stopped_speaking():
        if latency_start_time:
            elapsed = asyncio.get_event_loop().time() - latency_start_time
            logger.info(f"⏱️ [LATENCY] User stopped speaking, speech duration: {elapsed*1000:.0f}ms")

    @session.on("agent_started_speaking")
    def on_agent_started_speaking():
        if latency_start_time:
            elapsed = asyncio.get_event_loop().time() - latency_start_time
            logger.info(f"⏱️ [LATENCY] Agent started speaking, total latency: {elapsed*1000:.0f}ms (user speech start → agent audio)")

    @session.on("agent_stopped_speaking")
    def on_agent_stopped_speaking():
        logger.info(f"⏱️ [LATENCY] Agent stopped speaking")

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

                # Generate call summary and extract dynamic variables in parallel
                if transcript_text:
                    logger.info(f"📝 Generating call summary and extracting data...")

                    # Run summary and extraction in parallel
                    summary_task = generate_call_summary(transcript_text)
                    extraction_task = extract_data_from_transcript(transcript_text, dynamic_variables) if dynamic_variables else None

                    if extraction_task:
                        call_summary, extracted_data = await asyncio.gather(summary_task, extraction_task)
                    else:
                        call_summary = await summary_task
                        extracted_data = {}

                    if call_summary:
                        update_data["call_summary"] = call_summary
                        logger.info(f"📝 Call summary: {call_summary}")

                    if extracted_data:
                        update_data["extracted_data"] = extracted_data
                        logger.info(f"📊 Extracted data: {extracted_data}")

                supabase.table("call_records") \
                    .update(update_data) \
                    .eq("id", call_record_id) \
                    .execute()

                logger.info(f"✅ Call transcript saved to database{' with summary' if update_data.get('call_summary') else ''}{' with extracted_data' if update_data.get('extracted_data') else ''}")

                # Update caller memory if enabled
                if user_config and user_config.get("memory_enabled") and update_data.get("call_summary"):
                    agent_id = user_config.get("id")
                    # Get the remote party's phone number (same logic as memory retrieval)
                    if direction == "outbound":
                        memory_phone = contact_phone
                    else:
                        # For inbound, get caller phone from SIP participant
                        memory_phone = None
                        for participant in ctx.room.remote_participants.values():
                            attrs = participant.attributes
                            sip_phone = (
                                attrs.get("sip.remoteUri") or
                                attrs.get("sip.from") or
                                attrs.get("sip.caller") or
                                participant.identity
                            )
                            if sip_phone:
                                if sip_phone.startswith("sip:"):
                                    sip_phone = sip_phone[4:]
                                if sip_phone.startswith("sip_"):
                                    sip_phone = sip_phone[4:]
                                if "@" in sip_phone:
                                    sip_phone = sip_phone.split("@")[0]
                                if sip_phone and not sip_phone.startswith("+"):
                                    sip_phone = "+" + sip_phone
                                memory_phone = sip_phone
                                break

                    if memory_phone and agent_id:
                        # Generate embeddings if semantic memory is enabled
                        should_generate_embedding = user_config.get("semantic_memory_enabled", False)
                        await update_caller_memory(
                            caller_phone=memory_phone,
                            user_id=user_id,
                            agent_id=agent_id,
                            call_summary=update_data["call_summary"],
                            call_record_id=call_record_id,
                            transcript_text=transcript_text,
                            generate_embedding_flag=should_generate_embedding
                        )
                    else:
                        logger.info(f"🧠 Memory enabled but missing phone or agent_id (phone={memory_phone}, agent_id={agent_id})")
            else:
                logger.warning("No call_record found - cannot save transcript")

        except Exception as e:
            logger.error(f"Error saving transcript: {e}", exc_info=True)

    # Track if cleanup has been triggered to avoid duplicate saves
    cleanup_triggered = False

    # Register cleanup handler for participant disconnect
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        nonlocal cleanup_triggered
        logger.info(f"📞 Participant disconnected: {participant.identity}")
        logger.info(f"📝 Transcript has {len(transcript_messages)} messages before save")

        if cleanup_triggered:
            logger.info("⚠️ Cleanup already triggered, skipping")
            return
        cleanup_triggered = True

        # Wait a moment for any pending transcriptions to complete
        async def delayed_cleanup():
            logger.info("⏳ Waiting 2 seconds for pending transcriptions...")
            await asyncio.sleep(2)
            logger.info(f"📝 Final transcript message count: {len(transcript_messages)}")
            await on_call_end()

        # Run async cleanup - use create_task for proper tracking
        asyncio.create_task(delayed_cleanup())

    # Also handle room disconnection as fallback (fires when room closes)
    @ctx.room.on("disconnected")
    def on_room_disconnected():
        nonlocal cleanup_triggered
        logger.info(f"🚪 Room disconnected event fired")

        if cleanup_triggered:
            logger.info("⚠️ Cleanup already triggered, skipping")
            return
        cleanup_triggered = True

        async def room_cleanup():
            logger.info("⏳ Room disconnected - saving transcript...")
            await on_call_end()

        asyncio.create_task(room_cleanup())

    # Start the session FIRST for lowest latency - recording starts in background
    await session.start(room=ctx.room, agent=assistant)
    logger.info("✅ Session started - agent is now listening")

    log_call_state(ctx.room.name, "session_started", "agent", {
        "direction": direction,
        "has_greeting": bool(greeting),
        "llm_model": llm_model,
    })

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
            log_call_state(ctx.room.name, "greeting_spoken", "agent", {"direction": "inbound"})
        else:
            # Outbound call - don't greet, wait for user to speak
            logger.info("📞 Outbound call - Agent waiting for user to speak first")
            log_call_state(ctx.room.name, "waiting_for_user", "agent", {"direction": "outbound"})

            # Warm up ALL connections in background (reduces first-response latency)
            async def warmup_connections():
                try:
                    # 1. Warm up LLM (OpenAI) connection - make a tiny request
                    openai_key = os.getenv("OPENAI_API_KEY")
                    if openai_key:
                        async with aiohttp.ClientSession() as http:
                            async with http.post(
                                "https://api.openai.com/v1/chat/completions",
                                headers={
                                    "Authorization": f"Bearer {openai_key}",
                                    "Content-Type": "application/json",
                                },
                                json={
                                    "model": llm_model,
                                    "messages": [{"role": "user", "content": "hi"}],
                                    "max_tokens": 1,
                                },
                                timeout=aiohttp.ClientTimeout(total=5.0),
                            ) as resp:
                                await resp.read()
                        logger.info("🔥 LLM connection warmed up")

                    # 2. Warm up TTS (ElevenLabs) connection
                    await session.say("", allow_interruptions=True)
                    logger.info("🔥 TTS connection warmed up")

                except Exception as e:
                    logger.debug(f"Connection warmup: {e}")
            asyncio.ensure_future(warmup_connections())

    logger.info("✅ Agent session started successfully - ready for calls")

    # NOTE: Don't close livekit_api here - the background recording task needs it
    # It will be cleaned up when the process exits


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
