# Installing Git Hooks

Git hooks are scripts that run automatically before commits to catch common mistakes.

## Install Pre-Commit Hook

Run this command once to install the pre-commit hook:

```bash
ln -sf ../../.githooks/pre-commit .git/hooks/pre-commit
```

**Verify installation**:
```bash
ls -la .git/hooks/pre-commit
# Should show a symlink to ../../.githooks/pre-commit
```

## What the Pre-Commit Hook Checks

✅ **Python files**:
- No local imports (all imports must be at module top)
- No syntax errors

✅ **Reminds you to**:
- Test affected features before committing
- Follow PRE-COMMIT-CHECKLIST.md

## If Pre-Commit Hook Fails

The hook will **block your commit** and show errors like:

```
❌ FORBIDDEN: Local imports found in agents/livekit-voice-agent/agent.py

425:                    import datetime

All imports MUST be at module top (no indentation).
Move these imports to the top of the file.
```

**Fix the errors**, then retry:
```bash
git add <fixed-files>
git commit
```

## Bypassing the Hook (EMERGENCY ONLY)

If you absolutely must bypass the hook (NOT RECOMMENDED):
```bash
git commit --no-verify
```

**DO NOT bypass the hook** unless you have a very good reason and understand the risks.

## Troubleshooting

### Hook not running
```bash
# Check if hook is executable
ls -la .git/hooks/pre-commit

# If not executable, make it executable
chmod +x .git/hooks/pre-commit
```

### Hook symlink broken
```bash
# Re-create the symlink
rm .git/hooks/pre-commit
ln -sf ../../.githooks/pre-commit .git/hooks/pre-commit
```
