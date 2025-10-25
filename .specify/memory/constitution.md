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

**Rationale**: Technical debt compounds exponentially. Preventing it at creation time is orders of magnitude cheaper than remediation. Code is read 10x more than it is written; optimize for comprehension.

### II. Test-Driven Development (NON-NEGOTIABLE)

All new functionality MUST be developed following strict TDD methodology:
1. Write tests that define expected behavior
2. Verify tests fail (red phase)
3. Implement minimum code to make tests pass (green phase)
4. Refactor while maintaining passing tests
5. Repeat for next requirement

Tests MUST be written BEFORE implementation code. No implementation code may be committed without corresponding tests. Tests MUST cover:
- Happy path scenarios (expected normal operation)
- Edge cases and boundary conditions
- Error handling and failure modes
- Integration points between components

**Rationale**: TDD is non-negotiable because it forces clear requirements definition, prevents scope creep, enables fearless refactoring, and provides living documentation. Tests written after implementation are biased toward what was built rather than what should be built.

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