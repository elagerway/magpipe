---
description: Update architecture.md and CHANGELOG.md for recent changes, run regression tests, then commit (does NOT push)
---

Update project docs to reflect recent changes, verify no regressions, then create a commit. Does NOT push — user must confirm before pushing.

$ARGUMENTS

Follow ALL steps in order.

---

## Step 1 — Understand what changed

Run these in parallel:
```bash
git diff HEAD --stat
git log --oneline -10
git status -s
```

Read the staged/unstaged diffs to understand what actually changed:
```bash
git diff HEAD
```

If there are no staged changes and no recent unpushed commits, tell the user there's nothing to document and stop.

---

## Step 2 — Ensure dev server is running

Check if the dev server is already running on port 3000:
```bash
lsof -ti:3000 | head -1
```

If nothing is running, start it in the background:
```bash
npm run dev &
sleep 3
```

Tell the user: **"Dev server running at http://localhost:3000"** — they should open this URL to manually verify the changes look correct before the commit is pushed.

If frontend files changed, list the specific pages/URLs to check based on what changed. For example:
- `src/pages/agent-detail/configure-tab.js` changed → check `http://localhost:3000/agents/<any-agent-id>?tab=configure`
- `src/pages/admin/support-tab.js` changed → check `http://localhost:3000/admin?tab=support`
- `status/index.html` changed → check `https://status.magpipe.ai` (deployed separately to VPS)

---

## Step 3 — Regression test (unit tests)

Based on what changed, run targeted tests to ensure nothing is broken.

**Always run unit tests:**
```bash
npm test -- --reporter=verbose 2>&1 | tail -30
```

**If frontend files changed** (`src/`), identify which pages/components are affected and run relevant E2E specs. Look in `tests/` for spec files that match the changed area. Run them:
```bash
TEST_EMAIL=erik@snapsonic.com TEST_PASSWORD="$TEST_PASSWORD" npx playwright test tests/<relevant-spec>.spec.js --reporter=line 2>&1 | tail -40
```

**If edge functions changed** (`supabase/functions/`), trace which frontend features call those functions and run the matching E2E spec if one exists.

**If tests fail:**
- Show the failure output clearly
- STOP — do not proceed to docs or commit
- Tell the user what failed and ask how to proceed

**If tests pass**, show a brief summary ("✅ X unit tests passed, Y E2E specs passed") and continue.

---

## Step 3 — Update docs/architecture.md

Read the current `docs/architecture.md`. Identify any sections that need updating based on the changes:

- New edge functions → add to the Edge Functions section
- New DB tables/columns → add to the Database section
- New frontend pages or components → update Page Structure
- New integrations or external services → update System Overview
- Changed deployment details → update relevant section
- Removed features → remove or strike from docs

Make targeted edits — only update what changed. Do not rewrite unrelated sections.

---

## Step 4 — Update CHANGELOG.md

If `CHANGELOG.md` doesn't exist, create it at the project root with this header:
```markdown
# Changelog

All notable changes to Magpipe are documented here.
```

Prepend a new entry at the top (below the header) in this format:
```markdown
## [YYYY-MM-DD]

### Added
- ...

### Fixed
- ...

### Changed
- ...

### Removed
- ...
```

Only include sections that have entries. Keep each bullet concise (one line). Use today's date.

---

## Step 5 — Commit docs changes

Run `git status -s` and show the user all files that will be staged. Stage the doc files:
```bash
git add docs/architecture.md CHANGELOG.md
```

Then commit:
```bash
git commit -m "docs: update architecture and changelog for recent changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Step 6 — Summary (do NOT push)

Show the user:
- ✅ Test results summary
- What sections of architecture.md were updated
- The changelog entry that was added
- The commit hash

Then ask: **"Ready to push?"** — wait for explicit confirmation before pushing anything.
