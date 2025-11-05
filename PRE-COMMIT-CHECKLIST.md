# Pre-Commit Checklist (MANDATORY - NO EXCEPTIONS)

**Run this checklist BEFORE every `git commit`. If ANY item fails, FIX IT before committing.**

---

## 1. Python Code Quality Checks

### Check for Local Imports (CRITICAL)
```bash
# Find ALL import statements (should only be at top of file, no indentation)
grep -n "^[[:space:]]*import " <your-file>.py

# Search specifically for INDENTED imports (FORBIDDEN - must be ZERO results)
grep -n "^[[:space:]]\+import " <your-file>.py
```

**Expected**: All imports at lines 1-50 with NO indentation
**If indented imports found**: Move to top of file, re-run checks

### Check for Undefined Variables
```bash
# Run Python with basic syntax check
python3 -m py_compile <your-file>.py

# Better: Run pylint (install: pip install pylint)
pylint --disable=all --enable=undefined-variable,used-before-assignment <your-file>.py
```

**Expected**: Zero errors
**If errors found**: Fix undefined variables, missing imports

---

## 2. Breaking Change Analysis (MANDATORY)

### Before changing ANY code, identify what might break:

**Database Changes** (columns, tables, constraints):
```bash
# Example: Renaming column "call_sid" to "vendor_call_id"
grep -r "call_sid" . --exclude-dir=node_modules --exclude-dir=.git
```

**Function Signature Changes** (parameters, return types):
```bash
# Example: Changing initiateCall(number) to initiateCall(number, callerId)
grep -r "initiateCall(" . --exclude-dir=node_modules --exclude-dir=.git
```

**API Endpoint Changes** (paths, methods, request/response):
```bash
# Example: Changing /api/calls to /api/v2/calls
grep -r "/api/calls" . --exclude-dir=node_modules --exclude-dir=.git
```

**Configuration Changes** (env vars, config files):
```bash
# Example: Renaming RETELL_API_KEY to VOICE_API_KEY
grep -r "RETELL_API_KEY" . --exclude-dir=node_modules --exclude-dir=.git
```

**For EACH reference found**:
- [ ] Update it OR add backward compatibility
- [ ] Test that it still works
- [ ] Document in commit message

---

## 3. Test ALL Related Features (NON-NEGOTIABLE)

### Changed Python agent code?
```bash
# Test inbound call
# 1. Call your service number from your cell phone
# 2. Verify agent answers and responds
# 3. Verify transcript saves to database

# Test outbound call
# 1. Click "Call" button in UI
# 2. Verify call connects
# 3. Verify recording saves to database
```

### Changed Edge Function?
```bash
# Test via curl
curl -X POST https://your-project.supabase.co/functions/v1/your-function \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Expected: 200 OK with valid response, NOT 500 error
```

### Changed frontend code?
```bash
# Open browser console (F12)
# Navigate to affected page
# Perform affected action (e.g., place call, send SMS)
# Check console for errors (MUST be ZERO errors)
```

### Changed database migration?
```bash
# Apply migration locally first
export SUPABASE_ACCESS_TOKEN=your_token
npx supabase db push

# Verify schema is correct
npx supabase db diff

# Test queries that use changed tables/columns
```

---

## 4. Verify No Errors in Logs

### Check browser console
- [ ] Open DevTools (F12)
- [ ] Go to Console tab
- [ ] **MUST be zero errors** (warnings OK if explained)

### Check Edge Function logs
```bash
# Via Supabase Dashboard
# Go to Edge Functions → Select function → Logs tab
# Look for errors in last 5 minutes
```

### Check agent logs (LiveKit/Render)
```bash
# SSH into Render or check dashboard logs
# Look for UnboundLocalError, ImportError, TypeError, etc.
# MUST be zero errors for your feature
```

---

## 5. Git Pre-Commit Commands

```bash
# Stage your changes
git add <files>

# Check what's staged (review changes ONE MORE TIME)
git diff --staged

# Verify tests pass (if you have automated tests)
npm test  # or pytest, or whatever your test command is

# ONLY AFTER ALL CHECKS PASS:
git commit -m "Your commit message"

# DO NOT PUSH YET - WAIT FOR USER APPROVAL
# Present test results to user
# Get explicit "push it" or "commit looks good"
# THEN: git push origin <branch>
```

---

## 6. Commit Message Requirements

Your commit message MUST include:

```
Brief summary of what changed (50 chars max)

Detailed description:
- What problem does this solve?
- What did you change?
- How did you test it?

Breaking Change Analysis:
- Searched: grep -r "pattern" .
- Found: X references in Y files
- Updated: All references OR added backward compatibility

Testing:
✅ Tested inbound calls - agent answers and saves transcript
✅ Tested outbound calls - call connects and saves recording
✅ Checked browser console - zero errors
✅ Checked agent logs - zero errors

File paths changed: src/pages/inbox.js:245
```

---

## 7. Post-Commit Verification (After Push)

### After `git push`, verify deployment succeeded:

**Render (Agent)**:
- Go to Render dashboard
- Check latest deploy status: "Deploy live"
- Check logs for startup errors

**Supabase (Edge Functions)**:
- Functions auto-deploy on push
- Check Edge Functions logs for errors

**Test in production** (YES, AGAIN):
- [ ] Place test inbound call
- [ ] Place test outbound call
- [ ] Verify both work end-to-end
- [ ] If ANYTHING fails, REVERT IMMEDIATELY

---

## EMERGENCY: If You Broke Production

```bash
# 1. IMMEDIATELY revert to last known-good commit
git log --oneline  # Find last working commit SHA
git revert <bad-commit-sha>
git push origin <branch>

# 2. Verify revert fixed the issue
# Test the feature that was broken

# 3. Document what broke
# Add to SESSION-NOTES.md under "Known Issues"

# 4. Fix properly in NEW commit
# Follow this checklist completely
```

---

## Summary: The Rules

1. ✅ **Run ALL checks** before `git commit`
2. ✅ **Test ALL related features** (not just what you changed)
3. ✅ **Get user approval** before `git push`
4. ✅ **Verify deployment** succeeded in production
5. ✅ **Test in production** after deploy
6. ❌ **NEVER commit** without testing first
7. ❌ **NEVER push** without user approval
8. ❌ **NEVER assume** "it probably still works"

**If you skip ANY step, you WILL break production. Don't skip steps.**
