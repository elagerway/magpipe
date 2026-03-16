#!/bin/bash
# Sync master to opensource (elagerway/magpipe) via squashed commit
# Usage: bash scripts/sync-opensource.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ensure we're on master
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo -e "${RED}Error: Must be on master branch (currently on $CURRENT_BRANCH)${NC}"
  exit 1
fi

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: Working tree not clean. Commit or stash changes first.${NC}"
  exit 1
fi

# Fetch latest opensource
echo -e "${YELLOW}Fetching opensource remote...${NC}"
git fetch opensource

# Show what's changed
COMMITS_BEHIND=$(git log opensource/main..master --oneline | wc -l | tr -d ' ')
echo -e "${GREEN}Opensource is ${COMMITS_BEHIND} commits behind master${NC}"

if [ "$COMMITS_BEHIND" = "0" ]; then
  echo -e "${GREEN}Already in sync. Nothing to do.${NC}"
  exit 0
fi

# Create sync branch
echo -e "${YELLOW}Creating sync branch...${NC}"
git checkout -B opensource-sync opensource/main

# Overlay master
echo -e "${YELLOW}Overlaying master state...${NC}"
git checkout master -- .

# Remove private files
echo -e "${YELLOW}Removing private files...${NC}"
git reset HEAD CLAUDE.md 2>/dev/null || true
rm -f CLAUDE.md
git reset HEAD .claude/settings.local.json 2>/dev/null || true
rm -f .claude/settings.local.json
git reset HEAD .claude/commands/whats-new.md 2>/dev/null || true
rm -f .claude/commands/whats-new.md

# Scan for hardcoded keys
echo -e "${YELLOW}Scanning for hardcoded keys...${NC}"
LEAKED=$(git diff --cached -S "eyJ" --name-only | grep -v 'public/widget/magpipe-chat.js' | grep -v 'dist/' || true)
if [ -n "$LEAKED" ]; then
  echo -e "${RED}HARDCODED KEYS FOUND in staged files:${NC}"
  echo "$LEAKED"
  echo -e "${RED}Aborting. Strip these keys on master first.${NC}"
  git checkout master
  git branch -D opensource-sync
  exit 1
fi

echo -e "${GREEN}No hardcoded keys found.${NC}"

# Commit and push
echo -e "${YELLOW}Committing...${NC}"
git commit -m "Sync with upstream — $(date +%B\ %Y)"

echo -e "${YELLOW}Pushing to opensource/main...${NC}"
git push opensource opensource-sync:main --force

# Clean up
echo -e "${YELLOW}Cleaning up...${NC}"
git checkout master
git branch -D opensource-sync

echo -e "${GREEN}Done! Opensource synced. https://github.com/elagerway/magpipe${NC}"
