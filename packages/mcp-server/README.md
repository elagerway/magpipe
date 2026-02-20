# @magpipe/mcp-server

MCP server for [Magpipe](https://magpipe.ai) — manage agents, calls, SMS, contacts, and phone numbers from AI coding tools like Claude Code and Cursor.

## Install

```sh
npm install -g @magpipe/mcp-server
```

Or run directly with npx:

```sh
npx @magpipe/mcp-server
```

## Setup

### 1. Get an API key

Go to [magpipe.ai/settings](https://magpipe.ai/settings) → **API** tab → **Generate New Key**.

### 2. Configure your AI tool

#### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "magpipe": {
      "command": "npx",
      "args": ["-y", "@magpipe/mcp-server"],
      "env": {
        "MAGPIPE_API_KEY": "mgp_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "magpipe": {
      "command": "npx",
      "args": ["-y", "@magpipe/mcp-server"],
      "env": {
        "MAGPIPE_API_KEY": "mgp_your_key_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MAGPIPE_API_KEY` | Yes | API key starting with `mgp_` |
| `MAGPIPE_API_URL` | No | Override API base URL (default: `https://api.magpipe.ai/functions/v1`) |

## Available Tools

### Agents
- `list_agents` — List all agents with optional filters
- `get_agent` — Get full agent details including assigned phone numbers, custom functions, knowledge sources, and dynamic variables
- `create_agent` — Create a new agent
- `update_agent` — Update agent configuration
- `delete_agent` — Delete an agent

### Calls
- `list_calls` — List call records with filters
- `get_call` — Get call details, transcript, and summary
- `initiate_call` — Place an outbound call
- `terminate_call` — End an active call
- `get_recording` — Get a signed recording URL

### Messages
- `list_messages` — List SMS messages
- `get_message` — Get a single message
- `send_sms` — Send an SMS

### Phone Numbers
- `list_phone_numbers` — List provisioned numbers
- `search_phone_numbers` — Search available numbers to purchase
- `provision_phone_number` — Purchase a number
- `release_phone_number` — Release a number

### Contacts
- `list_contacts` — List contacts with search and filters
- `get_contact` — Get contact details
- `create_contact` — Create a contact
- `update_contact` — Update a contact
- `delete_contact` — Delete a contact

### Knowledge Base
- `list_knowledge_sources` — List knowledge sources for an agent
- `add_knowledge_source` — Add URL-based knowledge
- `add_knowledge_manual` — Add manual text knowledge
- `delete_knowledge_source` — Delete a knowledge source
- `sync_knowledge_source` — Re-crawl a URL source

### Voices
- `list_voices` — List available voices
- `delete_voice` — Delete a cloned voice

### Calendar
- `get_calendar_slots` — Get available booking slots
- `create_booking` — Create a booking
- `cancel_booking` — Cancel a booking

### API Keys
- `manage_api_keys` — Generate, list, revoke, or update API keys

### Other
- `list_models` — List available LLM models
- `chat_with_agent` — Send a text message to an agent
- `list_chat_sessions` — List chat sessions
- `list_custom_functions` — List custom functions
- `create_custom_function` — Create a custom function
- `manage_dynamic_variables` — Manage data extraction variables
- `list_scheduled_actions` — List scheduled actions

## Development

```sh
cd packages/mcp-server
npm install
npm run build
MAGPIPE_API_KEY=mgp_xxx node dist/index.js
```

## License

MIT
