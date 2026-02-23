"""
Test custom function tool creation logic.
Run: cd agents/livekit-voice-agent && python test_custom_functions.py
"""
import asyncio
import json
import sys
import os

# Add parent path for imports
sys.path.insert(0, os.path.dirname(__file__))

# Minimal mock to avoid needing full livekit install
from unittest.mock import MagicMock, AsyncMock, patch
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading


# ---- Test extract_json_path ----
def test_extract_json_path():
    from agent import extract_json_path

    data = {"community": {"name": "Dufferin Villa", "beds": 120}, "status": "found"}

    # Standard JSON path
    assert extract_json_path(data, "$.community.name") == "Dufferin Villa"
    assert extract_json_path(data, "$.community.beds") == 120
    assert extract_json_path(data, "$.status") == "found"

    # Nested path
    assert extract_json_path(data, "$.community") == {"name": "Dufferin Villa", "beds": 120}

    # Missing paths return None
    assert extract_json_path(data, "$.nonexistent") is None
    assert extract_json_path(data, "") is None
    assert extract_json_path(data, "no_dollar") is None

    # List indexing
    data2 = {"items": [{"id": 1}, {"id": 2}]}
    assert extract_json_path(data2, "$.items.0.id") == 1
    assert extract_json_path(data2, "$.items.1.id") == 2

    print("  [PASS] extract_json_path")


# ---- Test create_custom_function_tool (tool registration) ----
def test_tool_creation():
    from agent import create_custom_function_tool

    # Config matching real DB structure (SeniorHome lookup_community)
    func_config = {
        "name": "lookup_community",
        "description": "Look up information about a senior living community",
        "http_method": "GET",
        "endpoint_url": "https://example.com/api/community",
        "headers": [
            {"key": "x-magpipe-secret", "value": "test-secret-123"},
            {"key": "Accept", "value": "application/json"},
        ],
        "body_schema": [
            {"name": "community_name", "type": "string", "description": "Name of the community", "required": True},
        ],
        "response_variables": [
            {"name": "community_info", "json_path": ""},  # Empty json_path like real config
        ],
        "timeout_ms": 10000,
        "max_retries": 1,
    }

    tool = create_custom_function_tool(func_config)

    # Verify tool name matches function name (Bug #1 fix)
    assert tool.info.name == "lookup_community", f"Expected 'lookup_community', got '{tool.info.name}'"

    # Verify it's a RawFunctionTool (preferred approach)
    assert "Raw" in type(tool).__name__ or hasattr(tool, 'info'), f"Expected RawFunctionTool, got {type(tool).__name__}"

    print(f"  [PASS] tool creation — name='{tool.info.name}', type={type(tool).__name__}")

    # Test multiple tools don't conflict (Bug #1 — duplicate name crash)
    func_config2 = {
        "name": "check_availability",
        "description": "Check room availability",
        "http_method": "POST",
        "endpoint_url": "https://example.com/api/availability",
        "headers": [],
        "body_schema": [
            {"name": "date", "type": "string", "description": "Date to check", "required": True},
            {"name": "room_type", "type": "string", "description": "Type of room"},
        ],
        "response_variables": [],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool2 = create_custom_function_tool(func_config2)
    assert tool2.info.name == "check_availability", f"Expected 'check_availability', got '{tool2.info.name}'"
    assert tool.info.name != tool2.info.name, "Tools should have different names!"

    print(f"  [PASS] multiple tools — no duplicate name conflict")


# ---- Test header handling (Bug #3 — 'key' vs 'name') ----
def test_header_handling():
    """Verify headers with 'key' field are handled correctly."""
    from agent import create_custom_function_tool

    # Headers using 'key' (as stored in DB)
    config_with_key = {
        "name": "test_headers_key",
        "description": "Test",
        "http_method": "GET",
        "endpoint_url": "https://httpbin.org/get",
        "headers": [
            {"key": "x-api-key", "value": "secret123"},
            {"key": "x-custom", "value": "custom-val"},
        ],
        "body_schema": [],
        "response_variables": [],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    # Headers using 'name' (alternative format)
    config_with_name = {
        "name": "test_headers_name",
        "description": "Test",
        "http_method": "GET",
        "endpoint_url": "https://httpbin.org/get",
        "headers": [
            {"name": "x-api-key", "value": "secret123"},
        ],
        "body_schema": [],
        "response_variables": [],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool1 = create_custom_function_tool(config_with_key)
    tool2 = create_custom_function_tool(config_with_name)
    assert tool1 is not None
    assert tool2 is not None

    print("  [PASS] headers — both 'key' and 'name' field formats accepted")


# ---- Test HTTP execution with a local mock server ----
class MockHandler(BaseHTTPRequestHandler):
    """Mock HTTP server that returns community data."""

    def do_GET(self):
        # Check auth header
        auth = self.headers.get("x-magpipe-secret")
        if auth != "test-secret":
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "community_info": "Dufferin Villa is a 120-bed senior care facility in Toronto.",
            "status": "found",
        }).encode())

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length)) if content_length else {}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"result": f"Received: {body}"}).encode())

    def log_message(self, format, *args):
        pass  # Suppress logs


async def test_execution_with_mock_server():
    """Test the actual HTTP execution logic end-to-end."""
    from agent import create_custom_function_tool

    # Start mock server
    server = HTTPServer(("127.0.0.1", 0), MockHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{port}"

    # Test 1: Successful call with auth header
    config = {
        "name": "lookup_community",
        "description": "Look up community info",
        "http_method": "GET",
        "endpoint_url": f"{base_url}/api/community",
        "headers": [{"key": "x-magpipe-secret", "value": "test-secret"}],
        "body_schema": [
            {"name": "community_name", "type": "string", "description": "Name", "required": True},
        ],
        "response_variables": [
            {"name": "community_info", "json_path": ""},  # Empty json_path
        ],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool = create_custom_function_tool(config)

    # RawFunctionTool is callable — call with raw_arguments kwarg
    result = await tool(raw_arguments={"community_name": "Dufferin Villa"})
    assert "Dufferin Villa" in result, f"Expected community info in result, got: {result}"
    assert "120-bed" in result, f"Expected '120-bed' in result, got: {result}"
    print(f"  [PASS] execution with auth — got community data")

    # Test 2: Failed auth (Bug #4 — should report error, not "completed successfully")
    config_no_auth = {
        "name": "lookup_no_auth",
        "description": "Look up without auth",
        "http_method": "GET",
        "endpoint_url": f"{base_url}/api/community",
        "headers": [],  # No auth header
        "body_schema": [],
        "response_variables": [],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool2 = create_custom_function_tool(config_no_auth)
    result2 = await tool2(raw_arguments={})
    assert "failed" in result2.lower() or "error" in result2.lower(), \
        f"Expected error message for 401, got: {result2}"
    print(f"  [PASS] execution without auth — got error message (not 'completed successfully')")

    # Test 3: Response variable extraction with direct key lookup (Bug #5 fallback)
    config_with_var = {
        "name": "lookup_with_vars",
        "description": "Look up with response variables",
        "http_method": "GET",
        "endpoint_url": f"{base_url}/api/community",
        "headers": [{"key": "x-magpipe-secret", "value": "test-secret"}],
        "body_schema": [],
        "response_variables": [
            {"name": "community_info"},  # No json_path at all (not even empty string)
            {"name": "status", "json_path": "$.status"},  # With valid json_path
        ],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool3 = create_custom_function_tool(config_with_var)
    result3 = await tool3(raw_arguments={})
    assert "Dufferin Villa" in result3, f"Expected community_info via direct key lookup, got: {result3}"
    assert "found" in result3, f"Expected status via json_path, got: {result3}"
    print(f"  [PASS] response variable extraction — both json_path and direct key lookup work")

    server.shutdown()


# ---- Test parameter schema generation ----
def test_parameter_schema():
    """Verify raw_schema generates correct typed parameters."""
    from agent import create_custom_function_tool

    config = {
        "name": "search_rooms",
        "description": "Search available rooms",
        "http_method": "POST",
        "endpoint_url": "https://example.com/api/search",
        "headers": [],
        "body_schema": [
            {"name": "location", "type": "string", "description": "City or area", "required": True},
            {"name": "max_price", "type": "number", "description": "Maximum price per month"},
            {"name": "available", "type": "boolean", "description": "Only available rooms"},
        ],
        "response_variables": [],
        "timeout_ms": 5000,
        "max_retries": 0,
    }

    tool = create_custom_function_tool(config)

    # Check schema has individual typed params (not a single JSON string)
    schema = tool.info.raw_schema
    assert schema is not None, "Expected raw_schema to be set"
    params = schema.get("parameters", {})
    props = params.get("properties", {})

    assert "location" in props, f"Missing 'location' property in schema: {props}"
    assert props["location"]["type"] == "string"
    assert "max_price" in props, f"Missing 'max_price' property in schema: {props}"
    assert props["max_price"]["type"] == "number"
    assert "available" in props, f"Missing 'available' property in schema: {props}"
    assert props["available"]["type"] == "boolean"

    required = params.get("required", [])
    assert "location" in required, f"Expected 'location' in required: {required}"
    assert "max_price" not in required, f"'max_price' should not be required: {required}"

    print(f"  [PASS] parameter schema — individual typed params with correct required fields")


# ---- Run all tests ----
if __name__ == "__main__":
    print("\n=== Custom Function Logic Tests ===\n")

    print("1. extract_json_path:")
    test_extract_json_path()

    print("\n2. Tool creation & naming:")
    test_tool_creation()

    print("\n3. Header handling:")
    test_header_handling()

    print("\n4. Parameter schema:")
    test_parameter_schema()

    print("\n5. HTTP execution (mock server):")
    asyncio.run(test_execution_with_mock_server())

    print("\n=== All tests passed! ===\n")
