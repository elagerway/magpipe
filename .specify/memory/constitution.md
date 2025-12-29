<!--
SYNC IMPACT REPORT:
Version Change: 0.0.0 → 1.0.0
Modified Principles: N/A (initial creation)
Added Sections:
  - Core Principles (4 principles: Code Quality First, Test-Driven Development, User Experience Consistency, Performance by Design)
  - Quality Standards
  - Development Workflow
  - Governance
Templates Requiring Updates:
  ✅ plan-template.md - Constitution Check section already references constitution.md
  ✅ spec-template.md - No changes needed (spec is implementation-agnostic)
  ✅ tasks-template.md - Task generation rules already align with TDD principles
  ✅ agent-file-template.md - No changes needed (auto-generated from plans)
Follow-up TODOs: None
Rationale: MAJOR version 1.0.0 for initial constitution establishment
-->

# PAT Project Constitution

## Core Principles

### I. Code Quality First

Code MUST be maintainable, readable, and well-documented before it is considered complete. Every piece of code MUST:
- Mobile-first, mobile friendly
- Follow consistent formatting and style conventions for its language
- Include clear, descriptive names for functions, variables, and types
- Contain inline comments explaining complex logic or non-obvious decisions
- Be free of duplication beyond trivial one-liners (DRY principle)
- Pass linting and static analysis checks with zero warnings
- **Import all dependencies at module/file top** - NEVER use local imports mid-function (Python, JavaScript, TypeScript)

**Module-Level Import Enforcement (Python/JavaScript/TypeScript)**:
- ❌ **FORBIDDEN**: Local imports inside functions, methods, or code blocks
  ```python
  # WRONG - will cause UnboundLocalError if variable used before import
  def my_function():
      print(datetime.now())  # Uses datetime before import
      import datetime        # Too late - Python treats datetime as local var
  ```
- ✅ **REQUIRED**: All imports at top of file
  ```python
  # CORRECT - imports at module top
  import datetime

  def my_function():
      print(datetime.now())  # Works - datetime is module-level
  ```

**Why Local Imports Are Forbidden**:
1. **UnboundLocalError in Python**: If a variable is assigned/imported anywhere in a function, Python treats it as local. Using it before the assignment/import raises UnboundLocalError.
2. **Scope confusion**: Readers expect imports at top, not buried mid-function
3. **Breaking changes**: Adding code before a local import can silently break it
4. **Testing difficulty**: Local imports complicate mocking and testing
5. **Performance**: Import overhead on every function call vs. once at module load

**Real-World Incident (2025-11-05) - TWO-STAGE FAILURE**:

**Stage 1 - Introduction of Local Imports (Oct 25)**:
- Commit 43debebe added `import datetime` inside a function (lines ~347, ~425, ~602)
- Pattern: Local imports scattered throughout code
- No immediate breakage - imports came before usage in each block

**Stage 2 - Adding Code Before Local Import (Oct 27)**:
- Commit 45896bf added `datetime.datetime.now()` at top of entrypoint function (line 288)
- ERROR: This usage was BEFORE the local import on line 347
- Python saw local import later in function → treated `datetime` as local variable
- Using it before import → UnboundLocalError
- Result: Agent crashed on ALL room joins (inbound + outbound calls completely broken)

**Stage 3 - Incomplete Fix (Nov 5)**:
- Commit 1cb757e added module-level `import datetime` (line 8)
- BUT: Missed removing local imports on lines 425 and 602
- **CRITICAL PYTHON SCOPING RULE**: If ANY `import datetime` exists in a function, Python treats `datetime` as local FOR THAT ENTIRE FUNCTION, even if there's a module-level import
- Result: First fix worked for line 288, but lines 425 and 602 still crashed with UnboundLocalError
- Agent still broken - same error in different code paths

**Stage 4 - Complete Fix (Nov 5)**:
- Commit 2c0cbda removed ALL remaining local imports
- Only module-level import remains
- `datetime` now available everywhere without scoping issues

**Impact**:
- Production feature completely broken for 9 days
- Multiple partial fixes required due to scattered local imports
- Each local import created independent failure point

**Root Cause**:
- Local import anti-pattern violated module-level import convention
- Multiple local imports made fix incomplete and error-prone
- No automated detection (linting) to catch the pattern

**Enforcement (MANDATORY BEFORE ANY COMMIT)**:
1. **Git pre-commit hook AUTOMATICALLY checks** for local imports and blocks commits if found
   - Install once: `ln -sf ../../.githooks/pre-commit .git/hooks/pre-commit`
   - See INSTALL-GIT-HOOKS.md for details
2. **If hook not installed, manual check**: `grep -n "^[[:space:]]\+import " <file.py>` - MUST return ZERO results
3. **Follow PRE-COMMIT-CHECKLIST.md** for every commit - NO EXCEPTIONS
4. **Linters MUST flag local imports** (pylint: `import-outside-toplevel`, flake8: `I001`)
5. **Code reviews MUST reject** any non-top-level imports - NO EXCEPTIONS
6. **CI/CD MUST fail** if local imports detected
7. **No exceptions** - if circular import, refactor to eliminate it or use TYPE_CHECKING guard

**Rationale**: Technical debt compounds exponentially. Preventing it at creation time is orders of magnitude cheaper than remediation. Code is read 10x more than it is written; optimize for comprehension. Local imports introduce subtle bugs that bypass static analysis and only appear at runtime under specific conditions.

### II. Test-Driven Development (NON-NEGOTIABLE)

All new functionality MUST be developed following strict TDD methodology:
1. Write tests that define expected behavior
2. Verify tests fail (red phase)
3. Implement minimum code to make tests pass (green phase)
4. Refactor while maintaining passing tests
5. **Run comprehensive tests to verify nothing broke**
6. **Present results to user and WAIT for explicit permission to commit**
7. ONLY AFTER PERMISSION commit to git
8. Repeat for next requirement

Tests MUST be written BEFORE implementation code. No implementation code may be committed without corresponding tests. Tests MUST cover:
- Happy path scenarios (expected normal operation)
- Edge cases and boundary conditions
- Error handling and failure modes
- Integration points between components

**CRITICAL: Test Recursively BEFORE Committing to Git**:
- After implementing changes, ALWAYS test every related feature to ensure nothing broke
- Test the specific feature you changed (unit/integration tests)
- Test features that depend on your changes (downstream impact)
- Test features your changes depend on (upstream validation)
- Verify all existing tests still pass
- **Present test results to user and WAIT for explicit permission**
- **NEVER commit code to git without testing it first AND getting user's express permission** - no exceptions
- **NEVER push to GitHub without explicit user permission** - deployment happens after validation AND approval, not before
- If testing requires production/staging environment, get explicit user approval before pushing

**EXPRESS PERMISSION REQUIRED**: Do NOT run `git commit` or `git push` unless the user explicitly says "commit this", "push this", "looks good, commit it", or similar clear approval. Testing successfully does NOT automatically grant permission to commit - you MUST wait for the user to approve.

**Why Test-Before-Commit is NON-NEGOTIABLE**:
1. **Prevents cascading failures**: One untested change breaks multiple features
2. **Saves time**: Finding bugs pre-commit takes minutes; finding them post-deploy takes hours
3. **Maintains trust**: Users expect working code on every commit
4. **Enables CI/CD**: Automated deployments require reliable test coverage
5. **Documents behavior**: Tests show what the code is supposed to do

**Enforcement**: Any commit that breaks existing functionality is grounds for immediate revert. The developer MUST explain what testing was skipped and why.

**Rationale**: TDD is non-negotiable because it forces clear requirements definition, prevents scope creep, enables fearless refactoring, and provides living documentation. Tests written after implementation are biased toward what was built rather than what should be built. Testing AFTER committing means pushing broken code to version control, which destroys confidence in the codebase.

### IIa. Breaking Change Prevention (NON-NEGOTIABLE)

Before implementing ANY change (features, refactors, migrations, etc.), you MUST verify it won't break existing functionality:

**Mandatory Pre-Implementation Analysis**:
1. **Identify all elements being changed**: Database columns, function signatures, API endpoints, data formats, configuration keys, UI components, etc.
2. **Search for ALL references**: Use `grep -r "element" path/` to find every usage across the entire codebase
3. **Analyze each reference**: Determine if the change will break it or require updates
4. **Choose remediation strategy**:
   - **Backward compatibility** (PREFERRED): Keep old implementation working, add new alongside it
   - **Coordinated update**: Update all references simultaneously in same commit
   - **Fallback logic**: Code handles both old and new formats/signatures gracefully
5. **Document affected code**: In commit message or separate BREAKING_CHANGES.md file, list all files/functions modified
6. **Verify nothing breaks**: Test ALL affected code paths before committing

**Examples Requiring Analysis**:
- **Database changes**: Renaming/removing columns, changing data types, adding constraints
  - Search: `grep -r "column_name" .` to find all queries/models using it
  - Check: Frontend models, Edge Functions, Python agents, SQL queries, migrations
- **Function signature changes**: Adding/removing/reordering parameters
  - Search: `grep -r "functionName(" .` to find all call sites
  - Check: All imports, all invocations, all tests
- **API endpoint changes**: Changing paths, methods, request/response formats
  - Search: `grep -r "/api/endpoint" .` to find all fetch/axios calls
  - Check: Frontend code, external webhooks, mobile apps, documentation
- **Configuration changes**: Renaming env vars, changing config file structure
  - Search: `grep -r "CONFIG_KEY" .` to find all references
  - Check: .env files, deploy scripts, documentation

**Enforcement**: Code reviews MUST verify this analysis was performed. Pull requests MUST include "Breaking Change Analysis" section documenting:
1. What changed
2. What code was searched
3. What references were found
4. How backward compatibility was maintained OR why coordinated update is safe

**Rationale**: Breaking changes discovered post-deployment cause outages, data loss, and user trust erosion. The cost of prevention (10 minutes of grep) is orders of magnitude less than remediation (hours of debugging, hotfixes, rollbacks). Every breaking change that reaches production represents a process failure.

### III. User Experience Consistency

User-facing interfaces MUST provide predictable, intuitive experiences:
- Error messages MUST be actionable (state what went wrong AND how to fix it)
- **Vendor names MUST NEVER be exposed in user-facing messages** - do not mention third-party service names (Retell, SignalWire, OpenAI, etc.) in error messages, success messages, or any UI text visible to end users. Use product-centric language (e.g., "Pat AI assistant", "your number") instead.
- CLI tools MUST support both human-readable and machine-parseable output formats
- Response times MUST be predictable and meet stated performance targets
- UI elements MUST follow established design patterns and conventions
- Documentation MUST include quickstart examples that work end-to-end

API contracts and interface definitions MUST remain backward-compatible within major versions. Breaking changes MUST be documented with migration guides.

**Rationale**: Inconsistent UX creates cognitive load, erodes trust, and multiplies support burden. Every inconsistency forces users to re-learn patterns and question reliability. Exposing implementation details (vendor names) breaks user trust and creates confusion about product ownership.

### IV. Performance by Design

Performance MUST be designed in from the start, not optimized in later:
- All performance-critical operations MUST have documented target metrics (latency, throughput, resource usage)
- Performance tests MUST be automated and run on every change
- Resource consumption (CPU, memory, I/O) MUST be bounded and predictable
- Algorithms MUST be analyzed for time/space complexity before implementation
- Performance degradation under load MUST be graceful (no cliff edges)

Optimization work MUST be driven by profiling data, not assumptions. Premature optimization is forbidden; intentional design for performance is required.

**Rationale**: Performance problems discovered late require architectural changes that invalidate prior work. Users perceive slow software as broken software. Performance is a feature, not a nice-to-have.

### V. Outbound Call Architecture (NON-NEGOTIABLE)

**CRITICAL: LiveKit SIP Trunk Does NOT Work for Direct Outbound**:

The LiveKit SIP trunk feature for DIRECT outbound calls has been attempted multiple times and has NEVER worked in this project. All attempts result in "object cannot be found" errors when creating SIP participants via `livekit-outbound-call` Edge Function.

**Forbidden Actions**:
- ❌ NEVER attempt to use LiveKit SIP trunk (`ST_3DmaaWbHL9QT`) for direct outbound calls
- ❌ NEVER call the `livekit-outbound-call` Edge Function for production features
- ❌ NEVER implement outbound calls by having LiveKit create SIP participants directly

**Required Architecture for Direct Outbound Calls (No Recording)**:
- ✅ ALL direct outbound calls MUST use browser WebRTC SIP directly to SignalWire
- ✅ NO LiveKit intermediary for direct outbound calls
- ✅ Browser establishes SIP connection, dials destination directly through SignalWire

**Required Architecture for Outbound Call Recording (Bridged Conference)**:
- ✅ Recording IS POSSIBLE via bridged conference approach
- ✅ Architecture: SignalWire calls browser SIP endpoint (browser auto-answers) + SignalWire bridges to PSTN destination
- ✅ Both legs joined in SignalWire conference which supports recording
- ✅ Uses `initiate-bridged-call`, `outbound-call-swml`, and `outbound-call-status` Edge Functions
- ✅ Browser must auto-answer incoming SIP calls for bridging to work

**Bridged Conference Call Flow**:
1. User clicks Call button with recording enabled
2. Frontend calls `initiate-bridged-call` Edge Function with destination number
3. Edge Function calls SignalWire API to initiate call to browser's SIP number
4. Browser auto-answers the incoming SIP call
5. SignalWire fetches CXML from `outbound-call-swml` Edge Function
6. CXML instructs SignalWire to `<Dial>` the destination number with recording enabled
7. SignalWire bridges browser leg + PSTN leg in conference, records the conference
8. Recording saved to database via `sip-recording-callback` Edge Function

**If Asked to Implement Outbound Recording**:
1. Use the bridged conference approach (described above)
2. DO NOT attempt LiveKit SIP trunk approach
3. Ensure browser SIP auto-answer is implemented
4. Verify `initiate-bridged-call`, `outbound-call-swml`, and `sip-recording-callback` Edge Functions are deployed

**Historical Context**:
- LiveKit SIP trunk for direct outbound repeatedly attempted and failed
- Every attempt failed with "object cannot be found" when creating SIP participant
- Hours wasted on this approach before documenting it as non-working
- Bridged conference approach is the ONLY working method for outbound recording
- This limitation is now documented to prevent future wasted attempts on LiveKit trunk

**Enforcement**: Before implementing ANY outbound call feature, verify it uses the correct architecture. Code reviews MUST reject any use of `livekit-outbound-call` Edge Function for production features.

**Rationale**: Repeating failed approaches wastes time and money. LiveKit SIP trunk limitation has been confirmed through multiple independent attempts. The bridged conference approach is proven to work for recording. Document what works and what doesn't to avoid repeating mistakes.

### VI. Debugging Infrastructure Required (NON-NEGOTIABLE)

All complex systems MUST include comprehensive debugging infrastructure BEFORE declaring features complete:

**Database Call State Tracking**:
- Complex multi-step processes (calls, workflows, integrations) MUST log every state transition to database
- State logs MUST include: timestamp, component name, state identifier, detailed context (JSON), error messages
- State log table pattern:
  ```sql
  CREATE TABLE process_state_logs (
    id UUID PRIMARY KEY,
    process_id UUID REFERENCES parent_table(id),
    process_identifier TEXT,  -- room name, session id, etc.
    state TEXT NOT NULL,       -- state enum value
    component TEXT NOT NULL,   -- which service/function logged it
    details JSONB,             -- context about this state
    error_message TEXT,        -- if state is 'error'
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

**Required State Transitions to Log**:
- Process initiated (with input parameters)
- Each major component activation (service started, function called, API request sent)
- Each component completion (success/failure, output data)
- Integration point calls (external APIs, database operations, message queue sends)
- All error conditions (with full error context, not just message)
- Process completion (success/failure, final state)

**Real-World Example - LiveKit Outbound Calls**:
- ✅ Log: `initiated` - Edge function received request
- ✅ Log: `room_created` - LiveKit room created successfully
- ✅ Log: `sip_participant_created` - SIP call initiated to phone number
- ✅ Log: `agent_dispatched` - AI agent dispatch request sent
- ✅ Log: `agent_entrypoint_called` - Agent received dispatch and started
- ✅ Log: `agent_connected` - Agent connected to LiveKit room
- ✅ Log: `error` - Any failure with component and error details

**Why This is NON-NEGOTIABLE**:
1. **Eliminates "it works on my machine"**: Database shows exact state progression for every execution
2. **Stops console log archaeology**: No more "can you check the logs" - query database for full history
3. **Enables automated debugging**: Scripts can query state logs to diagnose issues
4. **Provides production visibility**: See what's happening in prod without SSH or log aggregation
5. **Documents actual behavior**: State logs are truth source for what really happened vs. what should happen

**Implementation Requirements**:
- State logging MUST NOT throw errors (wrap in try/catch, log failure, continue)
- State logging MUST be fast (async insert, no blocking waits)
- State logs MUST be queryable by process ID and timestamp
- State logs MUST have RLS policies for security (service role full access, users see own only)

**Rationale**: Complex systems fail in complex ways. Without comprehensive state logging, debugging requires manual log correlation across multiple services, which is slow, error-prone, and impossible for production issues after logs rotate. Database state logs provide instant visibility into every execution path, making debugging deterministic instead of guesswork.

## Quality Standards

### Code Review Requirements
- Every change MUST be reviewed by at least one other developer
- Reviewers MUST verify compliance with all constitutional principles
- Changes introducing technical debt MUST document justification and remediation plan

### Testing Discipline
- Minimum 80% code coverage for new code
- 100% coverage required for public APIs and critical paths
- Contract tests required for all inter-service communication
- Integration tests required for all external dependencies
- Performance tests required for operations with stated latency/throughput targets

### Documentation Standards
- Public APIs MUST have complete documentation with examples
- Complex algorithms MUST include rationale and complexity analysis
- Breaking changes MUST include migration guides
- Every feature MUST have a quickstart guide demonstrating end-to-end usage

## Development Workflow

### Test Credentials (MANDATORY)

**CRITICAL: NEVER use erik@snapsonic.com or any user's real credentials for testing**

All automated testing MUST use the dedicated test account:
- **Email**: `claude-test@snapsonic.test`
- **Password**: `TestPass123!`

**Why This Is Non-Negotiable**:
- Using real user credentials wastes tokens on unnecessary authentication
- Risks affecting production data
- Creates noise in analytics and logs
- Violates principle of test isolation

**API Testing**: Use `TEST_USER_TOKEN` from `.env` when available for Edge Function testing.

### Feature Development Process
1. **Specification**: Create feature spec defining user value and requirements (no implementation details)
2. **Planning**: Research technical approach, design data models and contracts
3. **Task Generation**: Break implementation into dependency-ordered tasks
4. **Test-First Development**: Write failing tests, then implement to pass
5. **Validation**: Run full test suite, performance benchmarks, and quickstart validation

### Quality Gates
Changes may not proceed to the next phase until:
- All tests pass (zero failures, zero skips)
- Code coverage targets met
- Linting and static analysis pass with zero warnings
- Performance benchmarks meet targets
- Code review approved by required reviewers
- Documentation complete and reviewed

### Complexity Budget
Every repository has a complexity budget. Adding complexity requires:
1. Clear documentation of why simpler alternatives are insufficient
2. Approval from team lead or architecture review
3. Offsetting removal of equivalent complexity elsewhere

Examples of complexity requiring justification:
- New external dependencies
- New architectural patterns (e.g., introducing event sourcing)
- Abstraction layers beyond direct business logic needs
- Configuration options beyond essential variability

## Governance

### Amendment Process
This constitution may be amended through:
1. Proposal documenting motivation and impact analysis
2. Review period for feedback and alternatives
3. Approval by project maintainers
4. Version increment per semantic versioning rules
5. Update of all dependent templates and documentation

### Version Semantics
- **MAJOR**: Backward-incompatible changes (principle removal, redefinition, or contradiction)
- **MINOR**: New principles added or material expansion of existing guidance
- **PATCH**: Clarifications, wording improvements, typo fixes

### Compliance
All code reviews MUST verify constitutional compliance. Violations require either:
- Immediate correction before merge, OR
- Documented exception with justification and remediation plan

Teams MUST conduct quarterly constitution reviews to:
- Assess adherence and identify systemic violations
- Evaluate whether principles remain fit for purpose
- Propose amendments based on lessons learned

### Authority
This constitution supersedes all other coding practices, style guides, and development procedures. Where conflicts arise, constitutional principles take precedence.

Complexity violations require documentation in plan.md Complexity Tracking section with clear justification. Unjustifiable complexity is grounds for rejecting the design.

**Version**: 1.0.0 | **Ratified**: 2025-09-29 | **Last Amended**: 2025-09-29