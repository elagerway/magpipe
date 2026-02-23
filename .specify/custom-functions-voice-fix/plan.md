# Implementation Plan: Custom Functions Voice Call Fix

**Branch**: `master` | **Date**: 2026-02-21 | **Status**: COMPLETED

## Summary
Fixed custom functions (webhook tools) failing during live voice calls despite working conceptually in chat. Six bugs found across tool registration, parameter handling, header configuration, response extraction, and error handling.

## Technical Context
**Language/Version**: Python 3.11 (LiveKit agent)
**Primary Dependencies**: livekit-agents SDK (>=1.4.0), aiohttp
**Storage**: PostgreSQL (Supabase) — `custom_functions` table
**Testing**: Manual voice call testing via SeniorHome agent
**Target Platform**: LiveKit voice agent (Render deployment)

## Root Cause Analysis

### Bug 1: Tool Name Registration
`@function_tool(description=...)` captures `func.__name__` at decoration time via `FunctionToolInfo(name=name or func.__name__)`. All dynamically created functions had inner name `custom_function`, causing:
- Only one function registered (others rejected as duplicates)
- Tool name mismatch — LLM called `lookup_community` but agent had `custom_function`

### Bug 2: JSON-in-JSON Parameters
Single `parameters: Annotated[str, "JSON string"]` forced LLMs to encode JSON within JSON — a pattern that frequently fails Pydantic validation silently.

### Bug 3: Header Field Name Mismatch
DB stores headers as `{"key": "x-magpipe-secret", "value": "..."}` but code used `h.get('name')`. Auth headers were never sent, causing 401s from customer endpoints.

### Bug 4: Response Variable Extraction
`json_path` field was empty/missing in config. `extract_json_path(result, '')` always returned None. Data was fetched but never extracted or spoken by agent.

### Bug 5: No HTTP Error Checking
HTTP 401/500 responses were reported as "Function completed successfully" because code only checked response keys, not status codes.

## Files Modified

| File | Change |
|------|--------|
| `agents/livekit-voice-agent/agent.py` | Complete rewrite of `create_custom_function_tool()` — raw_schema approach, fallback chain, header fix, response extraction, error handling |
| `agents/livekit-voice-agent/requirements.txt` | Pinned `livekit-agents>=1.4.0` (was `>=0.8.0`) for raw_schema support |

## Implementation Details

### Tool Registration (raw_schema approach)
```python
raw_schema = {
    "name": func_name,
    "description": func_description,
    "parameters": {
        "type": "object",
        "properties": properties,  # Individual typed params from body_schema
        "additionalProperties": False,
    },
}
@function_tool(raw_schema=raw_schema)
async def custom_fn_raw(raw_arguments: dict[str, object]):
    params = dict(raw_arguments)
    return await _execute_custom_function(params)
```

Three-tier fallback for SDK compatibility:
1. `raw_schema` → creates `RawFunctionTool` (preferred)
2. `name=` parameter on `@function_tool` (fallback if raw_schema unsupported)
3. `__name__` override before decoration (last resort)

### Header Fix
```python
header_name = h.get('name') or h.get('key')  # Support both field names
```

### Response Variable Extraction
```python
value = None
if json_path:
    value = extract_json_path(result, json_path)
if value is None and var_name and isinstance(result, dict):
    value = result.get(var_name)  # Direct key lookup fallback
```

### HTTP Error Checking
```python
if resp.status >= 400:
    error_msg = result.get('error', result.get('message', f'HTTP {resp.status}'))
    return f"The request failed with an error: {error_msg}"
```

## Key Discovery
**Chat (`webhook-chat-message`) does NOT use `custom_functions` table at all** — zero references. The "chat works but voice doesn't" framing was misleading. Chat tool calls go through OpenAI function calling directly, not the custom_functions DB table.

## Testing

Manual voice call testing:
1. Called SeniorHome agent number
2. Asked about "Dufferin Villa" community
3. Agent called `lookup_community` custom function
4. Webhook endpoint received request with correct auth headers
5. Agent read community information back to caller

## Progress Tracking

- [x] Bug identification and root cause analysis
- [x] Fix 1: Tool registration via raw_schema (commit ca68bcb)
- [x] Fix 2: SDK fallback chain + version pinning (commit 9f1536c)
- [x] Fix 3: Headers, response extraction, error handling (commit 613e654)
- [x] Production verification (SeniorHome agent voice call)

## Commits
- `ca68bcb` — Fix custom function tool registration (raw_schema approach)
- `9f1536c` — Add fallback chain + pin SDK version
- `613e654` — Fix headers, response extraction, HTTP error handling
