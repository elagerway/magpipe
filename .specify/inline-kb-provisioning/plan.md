# Implementation Plan: Inline KB Provisioning on Agent Knowledge Tab

**Branch**: `master` | **Date**: 2026-02-27 | **Status**: COMPLETED

## Summary

Replaced the previous KB management workflow (which required navigating away from the agent detail page) with a fully inline flow. Users can now create, configure, and delete knowledge bases directly from the Knowledge tab of the agent configuration UI without leaving the page.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES6+)
**Primary File**: `src/pages/agent-detail/knowledge-tab.js`
**Styling**: `public/styles/main.css`
**Dependencies**: Existing `knowledgeService.js` functions (`addSource`, `addManualSource`, `deleteSource`, `listSources`)
**Target Platform**: Vite SPA (Netlify)

## Problem

Previously, creating or managing a knowledge base required navigating away from the agent detail page entirely. Users lost their current form state and had to return to re-link the new KB to the agent. The flow was fragmented and required multiple navigation steps for a common operation.

## Solution

Two inline modals wired into the agent knowledge tab:

1. **Create New KB Modal** — Three-tab form (Website URL / Paste Content / Upload File)
2. **Manage KBs Modal** — List with delete controls

Both modals use the `contact-modal-*` CSS class pattern (per project convention) with overlay dismissal.

## Implementation Details

### KB Selector Dropdown

The knowledge tab has a multi-select dropdown button that shows:
- Number of connected KBs and total chunks
- Checkbox list of all available KBs
- "Create New" and "Manage" action buttons at the bottom

### Create New KB Modal (3-tab form)

**Tab 1: Website URL**
```javascript
// Crawl options
crawlMode: 'single' | 'sitemap' | 'recursive'
maxPages: 1–500
crawlDepth: 1–5  // recursive only
syncPeriod: '24h' | '7d' | '1mo' | '3mo'
```

**Tab 2: Paste Content**
- Title field + textarea
- Calls `knowledgeService.addManualSource(title, { text: content })`

**Tab 3: Upload File**
- Accepts `.pdf` and `.txt`
- Title field + file picker
- Calls `knowledgeService.addManualSource(title, { file: fileObject })`

**On success**: The new KB is automatically added to the agent's `knowledge_source_ids` and `scheduleAutoSave()` is triggered. The dropdown is immediately refreshed via `_refreshKBDropdown()`.

### Manage KBs Modal

Lists all KBs with chunk counts and crawl mode. Delete button per KB:
- Calls `knowledgeService.deleteSource(kbId)`
- Auto-deselects the deleted KB from the agent
- Refreshes dropdown immediately

### Real-Time UI Update Functions

```javascript
_refreshKBDropdown()        // Re-renders dropdown list + re-attaches listeners
updateKBSelectorButton()    // Updates main button text/icon (count + chunks)
updateSelectedKBsList()     // Adds/removes KB items from selected list below
```

### Auto-save Integration

After create or delete:
```javascript
this.agentData.knowledge_source_ids = [...updatedIds]
this.scheduleAutoSave({ knowledge_source_ids: this.agentData.knowledge_source_ids })
```

## Files Modified

| File | Change |
|------|--------|
| `src/pages/agent-detail/knowledge-tab.js` | Major expansion: inline modal flows, dropdown logic, refresh functions (+421 lines) |
| `public/styles/main.css` | KB-specific CSS (`.kb-selector-*`, `.kb-modal-*` classes) (+83 lines) |

## Edge Functions Used (Already Existed)

| Function | Purpose |
|----------|---------|
| `knowledge-source-add` | Create KB from URL |
| `knowledge-source-manual` | Create KB from text or file |
| `knowledge-source-delete` | Delete KB |
| `knowledge-source-list` | Fetch all KBs |

## Key Design Decisions

1. **No page navigation** — All flows stay on the agent detail page, preserving form state
2. **Auto-select on create** — New KB is automatically linked to the agent (no extra step)
3. **Tab-based create modal** — URL, paste, and file all in one modal reduces fragmentation
4. **Advanced options collapsible** — Crawl depth/max pages only show for non-single modes
5. **`contact-modal-*` pattern** — Matches project modal convention (not deprecated `.modal` / `.modal-content`)

## Progress Tracking

- [x] KB selector dropdown with multi-select checkboxes
- [x] "Create New KB" modal (URL tab)
- [x] "Create New KB" modal (Paste Content tab)
- [x] "Create New KB" modal (Upload File tab)
- [x] Crawl mode / max pages / crawl depth / sync period options
- [x] Auto-select new KB on agent after creation
- [x] "Manage KBs" modal with delete controls
- [x] Auto-deselect deleted KB from agent
- [x] `_refreshKBDropdown()` real-time updates
- [x] Auto-save integration

## Commits

- `cce959a` — Add inline KB provisioning on agent knowledge tab
