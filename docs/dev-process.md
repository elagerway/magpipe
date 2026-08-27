# Development Process Rules

These rules exist because Claude has broken production features by going out of scope or making unsafe assumptions. Each rule has a real incident behind it.

---

## 1. Stay In Scope — Do Not Touch Code You Were Not Asked To Change

**The rule**: If the task is "fix X", only touch code required to fix X. Do not refactor, optimize, or clean up surrounding code unless explicitly asked.

**What happened**: While implementing an inbox performance improvement, Claude replaced `select('*')` with an explicit column list. This dropped the `recordings` JSONB column, silently breaking call audio playback and duration display for all calls. This was not asked for and cost hours to diagnose.

**Enforcement**:
- Before touching any file, ask: "was I asked to change this?"
- If the answer is no, don't touch it
- "While I'm in here" changes are banned

---

## 2. Never Replace `select('*')` With an Explicit Column List

**The rule**: Do not convert a working `select('*')` Supabase query to an explicit column list, ever, unless the task explicitly requires it.

**Why**: Tables have JSONB columns (`recordings`, `metadata`, `extracted_data`, etc.) that are invisible unless you check the schema. Dropping them causes silent failures — no errors, data just disappears.

**If you must project columns**:
1. Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'X'` via Supabase MCP first
2. Account for every single column including all JSONB columns
3. Get approval before changing the query

**Specific rule**: The inbox `call_records` query uses `select('*')` — never change this.

---

## 3. Never Make UI Changes Without Approval

**The rule**: Do not change layout, styling, colors, component structure, or visual design without explicit user approval first.

**What happened**: While working on voice mode transcriptions, Claude removed speech bubbles and color coding without being asked. Required rollback.

**Enforcement**:
- Describe the proposed UI change and wait for yes/no before implementing
- "Improving" the UI while fixing a bug is out of scope

---

## 4. Check What Features Use Code Before Changing It

**The rule**: Before modifying any shared utility, query, CSS class, or module, identify what other features depend on it.

**How**:
- `grep -r "function_name\|class_name\|column_name" src/` before changing
- For DB queries: consider what the consuming view code reads from the result
- For CSS: check all pages that use the class, not just the one you're working on

---

## 5. Mandatory Schema Check Before Any Query Change

**The rule**: If a task requires changing a Supabase query, always check the full table schema first.

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'your_table' AND table_schema = 'public'
ORDER BY ordinal_position;
```

Run this via Supabase MCP before writing or modifying any `.select()` call.

---

## 6. Verify Affected Features Before Deploying

**The rule**: Before running `npx vercel --prod`, mentally walk through every feature that touches the code you changed and confirm it still works.

**Checklist**:
- What pages/components use the files I changed?
- What data flows through the queries I modified?
- If I changed CSS, what other views use those classes?
- Have I tested the primary feature AND the adjacent ones?

---

## 7. Performance Optimizations Require Explicit Sign-Off

**The rule**: Do not apply performance optimizations (column projection, query limits, caching, lazy loading) to working code unless the user reports a performance problem and asks you to fix it.

**Why**: The risk of breaking something silently almost always outweighs the gain from micro-optimizing code that already works.
