# Feature Specification: Admin Agent & Home Page Redesign

**Feature Branch**: `003-admin-agent-home`
**Created**: 2025-11-05
**Status**: Draft
**Input**: User description: "Create a conversational admin interface on the home page where users can configure their AI agent through natural language (voice or text)"

## Execution Flow (main)
```
1. Parse user description from Input ✓
2. Extract key concepts from description ✓
   → Actors: User, Admin Agent, Call/SMS Agent
   → Actions: Configure, Add knowledge, Authenticate, Update prompts
   → Data: System prompts, Access codes, Knowledge base URLs, Vector embeddings
3. For each unclear aspect: Marked below
4. Fill User Scenarios & Testing section ✓
5. Generate Functional Requirements ✓
6. Identify Key Entities ✓
7. Run Review Checklist (pending)
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing

### Primary User Story
As a Pat user, I want to configure how my AI agent handles calls and texts using natural conversation instead of filling out forms, so that I can quickly teach my agent new behaviors and add knowledge sources without navigating complex settings.

### Acceptance Scenarios

**Scenario 1: Text-based prompt configuration**
1. **Given** I am logged into Pat and viewing the home page
2. **When** I type "Be more friendly and casual when answering calls"
3. **Then** the admin agent confirms it understood my request, shows me a preview of the updated prompt, and asks me to confirm
4. **When** I confirm the change
5. **Then** the system prompt for my call-handling agent is updated and the change is saved

**Scenario 2: Adding knowledge from a URL**
1. **Given** I am in a conversation with the admin agent
2. **When** I say "Add knowledge from https://mycompany.com/faq"
3. **Then** the admin agent fetches the content, processes it for knowledge extraction, and confirms what information was added
4. **And** my call-handling agent can now reference this information when answering calls

**Scenario 3: Phone-based admin access**
1. **Given** I call one of my service numbers from my registered phone number
2. **When** the agent answers and detects my caller ID matches my user account
3. **Then** the agent asks "Is this [my name]?"
4. **When** I say "Yes"
5. **Then** the agent asks for my access code
6. **When** I provide the correct access code
7. **Then** the agent grants me admin access and I can configure settings via voice

**Scenario 4: Voice-based configuration over phone**
1. **Given** I have authenticated via phone (scenario 3)
2. **When** I say "When people ask about pricing, tell them to visit our website"
3. **Then** the agent confirms the instruction and updates the call-handling prompts
4. **And** future callers asking about pricing will be directed to the website

### Edge Cases
- What happens when a user provides an invalid or inaccessible URL for knowledge addition?
- How does the system handle authentication failures (wrong access code, unauthorized caller)?
- What if the user's natural language instruction is ambiguous or contradictory?
- How does the agent prevent unauthorized callers from accessing admin functions even if they know the user's name?
- What happens if the user tries to configure settings that would break the agent (empty prompt, circular logic)?

## Requirements

### Functional Requirements

**Home Page Interface**
- **FR-001**: System MUST replace current dashboard homepage with a conversational interface
- **FR-002**: System MUST support text-based conversation with the admin agent
- **FR-003**: System MUST support voice-based conversation with the admin agent on the homepage via a toggle button (click/tap to engage, click/tap again to disengage)
- **FR-004**: Admin agent MUST proactively greet users and explain available capabilities when page loads
- **FR-005**: System MUST display conversation history between user and admin agent

**Configuration Capabilities**
- **FR-006**: Users MUST be able to modify their call/SMS agent's system prompt through natural language
- **FR-007**: Users MUST be able to add knowledge sources via URL that the call/SMS agent can reference
- **FR-008**: System MUST show a preview of prompt changes before applying them
- **FR-009**: Users MUST be able to confirm or reject proposed changes
- **FR-010**: System MUST persist all configuration changes to the user's agent settings

**Knowledge Base Management**
- **FR-011**: System MUST fetch and process content from provided URLs
- **FR-012**: System MUST store processed knowledge in a searchable format for retrieval
- **FR-013**: Users MUST be able to view and manage knowledge sources in the Settings page
- **FR-014**: Users MUST be able to configure sync period for knowledge sources (24 hours, 7 days, 1 month, 3 months)
- **FR-015**: Users MUST be able to delete knowledge sources via Settings UI
- **FR-016**: Users MUST be able to request changes or deletion of knowledge sources through the admin agent conversation interface

**Phone-Based Admin Access**
- **FR-017**: System MUST detect when a call is from the user's registered phone number
- **FR-018**: System MUST authenticate the caller by requesting verbal name confirmation
- **FR-019**: System MUST request an access code for additional verification
- **FR-020**: System MUST grant admin privileges only after successful authentication
- **FR-021**: Users MUST be able to set and change their access code in the Settings page with click-to-view functionality
- **FR-022**: Access code changes MUST require SMS confirmation code verification
- **FR-023**: Access codes MUST be stored securely in the users table
- **FR-024**: System MUST limit failed phone authentication attempts to 3 tries, then lock access until user resets access code via web app (Settings or admin agent)

**Voice Admin Tasks**
- **FR-025**: Authenticated users MUST be able to perform all admin tasks via phone that are available on the web interface
- **FR-026**: System MUST provide verbal confirmation of all configuration changes made via phone
- **FR-027**: System MUST handle phone admin sessions that end abruptly (hang up, disconnect)

**Agent Separation**
- **FR-028**: Admin agent MUST operate independently from the call/SMS handling agent
- **FR-029**: Changes to call/SMS agent configuration MUST NOT affect the admin agent's behavior
- **FR-030**: Admin agent MUST have access to read and modify call/SMS agent settings

**Security & Access Control**
- **FR-031**: Only authenticated users MUST be able to access the admin agent interface
- **FR-032**: System MUST log all admin actions for audit purposes
- **FR-033**: System MUST prevent unauthorized phone callers from accessing admin functions even with social engineering

### Non-Functional Requirements
- **NFR-001**: Admin agent responses MUST feel natural and conversational
- **NFR-002**: System MUST process and apply configuration changes with lowest possible latency
- **NFR-003**: Knowledge base additions MUST complete with lowest possible latency for content fetching and processing
- **NFR-004**: Voice quality for phone-based admin MUST be clear and understandable
- **NFR-005**: Interface MUST be accessible on mobile and desktop browsers

### Key Entities

- **Admin Agent**: Conversational interface that helps users configure their Pat AI assistant; separate from the call/SMS handling agent; can read and modify call/SMS agent settings
- **Call/SMS Agent**: The agent that handles inbound calls and text messages from customers; its behavior is configured by the admin agent
- **Admin Conversation**: A session between the user and the admin agent; includes message history, pending changes, and authentication state
- **Knowledge Source**: A URL that has been processed and added to the knowledge base; includes original URL, processed content, sync period (24 hours/7 days/1 month/3 months), and metadata; manageable via Settings page and admin agent conversation
- **Access Code**: A secret code used for phone-based admin authentication; stored in users table; viewable/changeable in Settings with click-to-view; changes require SMS confirmation; failed attempts (3 max) lock access until web reset
- **Configuration Change**: A proposed or applied modification to agent settings; includes what was changed, when, and by whom; requires user confirmation before application

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

### Clarifications Resolved
1. ✅ Voice input: Toggle button (click/tap to engage/disengage)
2. ✅ Knowledge base: Settings page with sync period dropdown (24hrs/7days/1mo/3mo)
3. ✅ KB deletion: Settings UI + agent conversation interface
4. ✅ Access code: Stored in settings with click-to-view, in users table
5. ✅ Auth failures: 3 attempts then lock until web reset
6. ✅ Access code storage: Settings with click-to-view and change, SMS confirmation
7. ✅ Latency target: Lowest possible

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked and clarified
- [x] User scenarios defined
- [x] Requirements generated (33 functional, 5 non-functional)
- [x] Entities identified and detailed
- [x] Review checklist passed
- [x] All clarifications resolved

---

## Next Steps

Run `/plan` to generate the implementation plan for this feature.
