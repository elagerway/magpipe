# Feature Specification: Call Transfer

**Feature Branch**: `call-transfer`
**Created**: 2025-12-27
**Status**: Draft

## Overview

Enable Pat (the AI agent) to transfer calls to a designated phone number when requested by callers or when the agent determines a transfer is appropriate. This applies to both inbound calls (caller wants to speak to a human) and outbound calls (callee wants to speak to a "manager" or supervisor).

---

## User Scenarios & Testing

### Primary User Story

As a Pat user, I want to configure one or more transfer numbers so that when callers or callees request to speak with a human (e.g., "let me talk to your manager"), Pat can seamlessly transfer the call to the appropriate person.

### Acceptance Scenarios

#### Configuration

1. **Given** a user is in the agent configuration view, **When** they add a transfer number, **Then** the number is saved and available for Pat to use during calls

2. **Given** a user has configured multiple transfer numbers, **When** they assign labels to each (e.g., "Manager", "Support", "Personal"), **Then** Pat can intelligently route transfers based on the caller's request

3. **Given** a user configures a transfer number, **When** they set availability hours (optional), **Then** Pat only attempts transfers during those hours and offers voicemail or callback outside those hours

#### Inbound Call Transfers

4. **Given** Pat is handling an inbound call, **When** the caller says "I want to speak to a human" or similar, **Then** Pat initiates a warm transfer to the configured transfer number

5. **Given** Pat initiates a transfer on an inbound call, **When** the transfer number answers, **Then** both parties are connected and Pat exits the call

6. **Given** Pat initiates a transfer on an inbound call, **When** the transfer number doesn't answer or is busy, **Then** Pat informs the caller and offers alternatives (voicemail, callback, try again later)

7. **Given** Pat is handling an inbound call from an unknown/unverified caller, **When** they request a transfer, **Then** Pat may apply additional vetting before transferring (configurable)

#### Outbound Call Transfers (Agent-Assisted)

8. **Given** the user places an outbound call via Pat, **When** the callee says "let me speak to your manager" or similar, **Then** Pat initiates a transfer to the configured transfer number

9. **Given** Pat transfers an outbound call, **When** the transfer completes, **Then** all three parties (original caller context) are properly handled and the call record reflects the transfer

10. **Given** Pat is on an outbound call with the agent toggle enabled, **When** a transfer is requested, **Then** the bridged call architecture supports the transfer seamlessly

#### Outbound Call Transfers (Manual/Direct SIP)

11. **Given** the user is on the phone dialer view, **When** no call is active, **Then** a transfer button is visible but disabled (left of the call button)

12. **Given** the user places a direct SIP call (agent toggle off), **When** the call is active, **Then** the transfer button becomes enabled

13. **Given** the user is on an active direct SIP call, **When** they tap the transfer button, **Then** a modal appears with configured transfer numbers and an option to enter a custom number

14. **Given** the user selects a transfer number from the modal, **When** they confirm, **Then** the callee is transferred to that number and the user's call ends

15. **Given** the user initiates a manual transfer, **When** the transfer completes, **Then** the call record is updated with transfer metadata

#### Transfer Experience

16. **Given** Pat initiates any transfer, **When** connecting the parties, **Then** Pat announces the transfer to both parties (e.g., "I'm connecting you now")

17. **Given** a transfer is in progress, **When** either party hangs up before connection, **Then** the remaining party is informed gracefully

18. **Given** a transfer completes successfully, **When** the call ends, **Then** the call record includes transfer metadata (who was transferred, to which number, duration of each leg)

### Edge Cases

- What happens if the transfer number is the same as the caller's number?
- How does Pat handle "transfer to [specific person name]" when multiple transfer numbers exist?
- What if the caller requests a transfer but the user has no transfer numbers configured?
- How does the system handle rapid repeated transfer requests (spam prevention)?
- What happens if a call is already a transfer and another transfer is requested (chain transfers)?
- How does Pat handle international transfer numbers?
- What if the transfer number has its own voicemail that picks up?
- How does the system behave during network issues mid-transfer?

---

## Requirements

### Functional Requirements

#### Transfer Number Configuration

- **FR-001**: System MUST allow users to add one or more transfer phone numbers
- **FR-002**: System MUST allow users to assign a label/name to each transfer number (e.g., "Manager", "Support")
- **FR-003**: System SHOULD allow users to set a primary/default transfer number
- **FR-004**: System SHOULD allow users to configure availability hours for each transfer number
- **FR-005**: System MUST validate transfer numbers are in E.164 format before saving
- **FR-006**: System SHOULD allow users to set transfer behavior preferences (always ask, auto-transfer for known contacts, etc.)

#### Inbound Call Transfer

- **FR-007**: Pat MUST recognize common transfer request phrases ("speak to a human", "talk to someone", "get me a manager", etc.)
- **FR-008**: Pat MUST attempt to transfer the call when a valid transfer request is detected
- **FR-009**: Pat MUST announce the transfer to the caller before initiating
- **FR-010**: System MUST connect the caller to the transfer number when answered
- **FR-011**: Pat MUST handle unanswered transfers gracefully with alternatives
- **FR-012**: System MUST remove Pat from the call after successful transfer (warm handoff)

#### Outbound Call Transfer (Agent-Assisted)

- **FR-013**: Pat MUST recognize transfer requests from callees on outbound calls
- **FR-014**: System MUST support transfers within the bridged call architecture (agent-enabled outbound calls)
- **FR-015**: Pat MUST maintain call context and quality during outbound call transfers

#### Outbound Call Transfer (Manual/Direct SIP)

- **FR-016**: System MUST display a transfer button in the phone dialer UI (left of the call button)
- **FR-017**: Transfer button MUST only be visible/enabled during an active call
- **FR-018**: When user taps transfer button during a direct SIP call, system MUST present transfer number options
- **FR-019**: User MUST be able to select from configured transfer numbers or enter a custom number
- **FR-020**: System MUST execute the transfer and connect the callee to the selected number
- **FR-021**: System MUST update the call record to reflect the manual transfer

#### Transfer Handling

- **FR-022**: System MUST log all transfer attempts in the call record with outcome (success, no answer, busy, failed)
- **FR-023**: System MUST record the entire call including the transferred portion (when recording is enabled)
- **FR-024**: System SHOULD support "warm transfer" (Pat announces caller to transfer recipient before connecting)
- **FR-025**: System SHOULD support "cold transfer" (immediate connection without announcement) as configurable option

#### Agent Intelligence

- **FR-026**: Pat SHOULD intelligently select the appropriate transfer number based on the request context
- **FR-027**: Pat MUST NOT transfer calls that appear to be scam/spam attempts (configurable)
- **FR-028**: Pat SHOULD remember if a caller has previously requested transfers and offer proactively

### Non-Functional Requirements

- **NFR-001**: Transfer initiation MUST begin within 2 seconds of Pat deciding to transfer
- **NFR-002**: Transfer audio quality MUST be maintained at the same level as the original call
- **NFR-003**: System MUST support transfer numbers in any country the telephony provider supports
- **NFR-004**: Transfer configuration UI MUST be accessible and simple (add number, label, save)

---

## Key Entities

### TransferNumber
- Phone number (E.164 format)
- Label/name (e.g., "Manager", "Personal")
- Is default (boolean)
- Availability hours (optional)
- Created/updated timestamps

### CallTransfer (extends CallRecord metadata)
- Transfer initiated at (timestamp)
- Transfer target number
- Transfer target label
- Transfer outcome (connected, no_answer, busy, failed)
- Transfer duration (if connected)
- Transfer initiated by (caller_request, agent_decision)

---

## Open Questions

1. Should there be a limit on the number of transfer numbers a user can configure?
2. Should transfers require a passcode/verification from the transfer recipient?
3. Should the system support transferring to SIP endpoints in addition to PSTN numbers?
4. How should billing work for transferred calls (especially international)?
5. Should there be a "transfer back" feature where the transfer recipient can return the call to Pat?

---

## Out of Scope (Future Enhancements)

- Conference calls (adding Pat + caller + transfer recipient simultaneously)
- Transfer to queue/hold with music
- Transfer to external call centers or IVR systems
- Scheduled transfers (transfer at a specific time)
- Transfer approval workflow (notify user before transferring)
