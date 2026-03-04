import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagpipeClient } from "../client.js";
import { registerAgentTools } from "./agents.js";
import { registerCallTools } from "./calls.js";
import { registerMessageTools } from "./messages.js";
import { registerNumberTools } from "./numbers.js";
import { registerContactTools } from "./contacts.js";
import { registerKnowledgeTools } from "./knowledge.js";
import { registerVoiceTools } from "./voices.js";
import { registerCalendarTools } from "./calendar.js";
import { registerApiKeyTools } from "./api-keys.js";
import { registerMiscTools } from "./misc.js";

export function registerAllTools(server: McpServer, client: MagpipeClient) {
  registerAgentTools(server, client);
  registerCallTools(server, client);
  registerMessageTools(server, client);
  registerNumberTools(server, client);
  registerContactTools(server, client);
  registerKnowledgeTools(server, client);
  registerVoiceTools(server, client);
  registerCalendarTools(server, client);
  registerApiKeyTools(server, client);
  registerMiscTools(server, client);
}
