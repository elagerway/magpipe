---
description: Merge current branch to master via PR, deploy edge functions and frontend
---

Merge the current feature branch to master through a proper PR workflow. If no branch is specified, use the current branch.

$ARGUMENTS

Follow ALL steps in order. Do not skip any step. STOP and ask the user before any destructive action.

---

## Step 0 — Pre-flight checks

1. Run `git status -s` — if there are uncommitted changes, ask the user whether to commit them first.
2. Run `git branch --show-current` — confirm we're NOT on master. If on master, stop and tell the user.
3. Run `git log master..HEAD --oneline` — show the commits that will be included. If empty, stop ("nothing to merge").
4. Push the current branch if it has unpushed commits: `git push origin $(git branch --show-current)`.

---

## Step 1 — Authenticate GitHub CLI

Check if `gh` is authenticated:
```bash
gh auth status 2>&1
```
If not authenticated, tell the user to run `gh auth login` and stop.

---

## Step 2 — Create Pull Request

Create a PR from the current branch to master:

1. Generate a PR title from the branch name and recent commits (keep under 70 chars).
2. Generate a PR body with:
   - `## Summary` — 3-5 bullet points summarizing the changes (from commit messages)
   - `## Edge functions to deploy` — list any changed edge functions (check `git diff master..HEAD --name-only -- supabase/functions/`)
   - `## Test status` — note what was tested
3. Create the PR:
```bash
gh pr create --base master --head BRANCH_NAME --title "TITLE" --body "BODY"
```
4. Show the PR URL to the user.

---

## Step 3 — Wait for user approval

Ask the user: **"PR created. Review it and tell me when to merge."**

Do NOT proceed until the user explicitly says to merge.

---

## Step 4 — Merge the PR

```bash
gh pr merge PR_NUMBER --merge --delete-branch
```

Then pull master locally:
```bash
git checkout master && git pull origin master
```

---

## Step 5 — Deploy edge functions

Check which edge functions changed:
```bash
git diff HEAD~1..HEAD --name-only -- supabase/functions/ | grep -oP 'supabase/functions/\K[^/]+' | sort -u
```

For each changed function, deploy it. Use `--no-verify-jwt` for functions that need it (check the deploy safety script or CLAUDE.md for the list):
```bash
scripts/deploy-functions.sh
```

If the deploy script doesn't exist or fails, deploy manually:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env | cut -d= -f2)
npx supabase functions deploy FUNCTION_NAME --no-verify-jwt --project-ref mtxbiyilvgwhbdptysex
```

Show the user which functions were deployed.

---

## Step 6 — Deploy frontend

**IMPORTANT**: Only deploy from master. Verify we're on master first.

```bash
git branch --show-current  # Must be "master"
npx vercel --prod
```

Show the deployment URL to the user.

---

## Step 7 — Post-merge cleanup

1. Run `git branch -d BRANCH_NAME` to clean up the local branch (remote was deleted by --delete-branch).
2. Show a summary:
   - PR URL
   - Commits merged
   - Edge functions deployed
   - Frontend deployment URL
3. Ask: **"Should I run `/whats-new` to publish a blog post and tweet?"**
