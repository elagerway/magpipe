# Fraud detection and the global fraud list

How Magpipe spots fraud in a call transcript, records the caller in a
cross-workspace fraud database, and blocks that number everywhere.

Surfaced in the app at **Phone → Fraud**.

---

## 1. The shape of it

```
call ends
   │
   ├─ agent.py  detect_fraud(transcript)          gpt-4o-mini, runs in the
   │            └─ confidence ≥ 0.85 ────┐        existing post-call gather
   │                                     │
   └─ report-fraud-number  ←─────────────┘
        ├─ guards        known contact? whitelisted? our own number? rate cap?
        ├─ enrich        SignalWire LRN/LERG + CNAM  (_shared/phone-lookup.ts)
        ├─ corroborate   FTC + FCC complaint counts  (local index)
        └─ write         fraud_numbers (status=blocked) + fraud_reports
                                     │
inbound call / SMS / WhatsApp ───────┘
        isFraudBlocked() → <Reject reason="busy"/> or silent drop
```

Two ingest jobs keep the public complaint index fresh:

```
sync-ftc-complaints   daily 09:20 UTC   FTC daily CSV      ─┐
                                                            ├─→ fraud_external_numbers
sync-fcc-complaints   daily 09:40 UTC   FCC Socrata API    ─┘
```

---

## 2. The rule that governs everything

**First-party evidence blocks. Public complaint data never does.**

| Evidence | Source | Can it block? |
|----------|--------|---------------|
| Our own call transcript, classified at ≥0.85 confidence | `fraud_numbers` | **Yes** — globally, immediately |
| A human in a workspace reporting a number | `fraud_numbers` | **Yes** — a person looked at it |
| A workspace adding a number to its own blocklist | `fraud_numbers` (flagged) | **Only at 2+ workspaces** — see below |
| FTC / FCC consumer complaints | `fraud_external_numbers` | **No** — corroborates only |

### Workspace blocklists

Every `blocked_callers` entry lands on the fraud list, and `manage-blocked-callers`
reports each new block as it happens. But a blocklist entry means *"I don't want
this caller"* — an ex, a landlord, a persistent but legitimate salesperson — not
*"this is a scam*. One workspace blocking a number therefore only **flags** it;
`BLOCK_PROMOTION_WORKSPACES` (2) independent workspaces blocking the same number
promotes it to a global block. In risk terms one block is worth 12 points, well
under the 50 a single confident detection starts at.

A blocklist entry deliberately does **not** increment `first_party_reports` — it
is counted in `workspaces_blocking` instead, so re-running a backfill can't walk
a number's score upward pass after pass.

The reason is spoofing. FTC and FCC complaints are unverified consumer reports
about *the number that was displayed*, and caller ID is trivially forged. A
listing is an allegation about a displayed number, not proof about the line that
placed the call — blocking on one would strand real callers whose number a
spammer had borrowed. `riskScore()` encodes this: a number with 1,000+ public
complaints and no first-party report scores under 40, while a single confident
first-party detection starts at 50.

---

## 3. Detection

`detect_fraud()` in `agent.py` runs on the post-call transcript, inside the same
`asyncio.gather` as the summary and extraction — concurrent, so it adds no
wall-clock to hang-up handling. It is skipped entirely when the caller never
spoke.

The prompt is deliberately narrow, because a positive result blocks a number for
every customer on the platform:

- **Is fraud:** the caller demanding gift cards or wire transfers, impersonating
  a bank / government agency / the business itself, phishing for credentials,
  card numbers or one-time codes, extortion, fake invoices, crypto payment demands.
- **Is not fraud:** rude, angry, confused, wrong-number or sales-y callers. A
  caller describing a scam *they* are the victim of is not fraud.

Returns `{is_fraud, category, confidence, evidence}`. Below `FRAUD_MIN_CONFIDENCE`
(0.85) nothing is reported.

Categories are duplicated in `agent.py` and `_shared/fraud.ts` (Python can't
import a Deno module). **They must stay in sync** — `report-fraud-number` coerces
anything unrecognised to `other`. A unit test pins the list.

---

## 4. Guards before a global block

A global block is the highest-blast-radius action in the product. Every one of
these blocks the *block*, not the report — a tripped guard still records the
report and leaves the entry `flagged` for a human:

| Guard | Why |
|-------|-----|
| `known_contact` | The number is in the reporting workspace's contacts |
| `whitelisted_caller` | It's on that workspace's `call_whitelist` |
| `own_service_number` | It's one of our own service numbers |
| `rate_limited` | More than 25 automatic blocks in the last hour — a runaway classifier can't blackhole the platform |
| `low_confidence` | `transcript_llm` under 0.85 |

A `cleared` entry stays cleared: a fresh detection re-flags it for review rather
than silently undoing a human's decision.

**Per-workspace escape hatch:** `fraud_allowlist`. A workspace that believes an
entry is a false positive allows the number for itself (Phone → Fraud → *Allow
here*) without touching the global entry. Verified live: with an override the
same number rings through; without it the call gets `<Reject reason="busy"/>`.

---

## 5. Enforcement

`isFraudBlocked()` in `_shared/fraud.ts`, called from three inbound paths
alongside the existing per-workspace `blocked_callers` check (both run in
parallel, both are indexed point lookups):

| Path | Result |
|------|--------|
| `webhook-inbound-call` | `<Reject reason="busy"/>` — no ring, no credits, no call record |
| `webhook-inbound-sms` | Silent drop |
| `webhook-inbound-whatsapp` | Silent drop |

**It fails open.** If the lookup errors, the caller rings through. Stranding a
legitimate caller because a query timed out is worse than letting one fraud call
land.

---

## 6. Public complaint data

Bulk-ingested rather than queried live, so the inbound path answers "has this
caller been reported?" from a local primary-key lookup instead of a
cross-internet request while someone waits on the line.

### FTC — Do Not Call, Reported Calls

- **Daily CSV**, `https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_YYYY-MM-DD.csv`
  — ~11k complaints/day, ~1.1 MB, roughly a 5-week trailing window.
- **The API cannot be used per-number.** `api.ftc.gov/v0/dnc-complaints` filters
  by date / state / city / *consumer* area code only — there is no caller-number
  filter, so there is no way to ask it about one number. Hence the CSV.
- **The file host 403s non-browser user agents.** The sync sends a browser UA.
- Numbers arrive as bare 10 digits.

### FCC — Consumer Complaints, Unwanted Calls

- Socrata dataset `vakf-fz8e`, `https://opendata.fcc.gov/resource/vakf-fz8e.json`.
  No API key required; `FCC_APP_TOKEN` lifts the anonymous rate limit if set.
- `caller_id_number` is **empty on most complaints** — the FCC doesn't require
  it. A page of 5,000 complaints yielding few usable rows is expected.
- Numbers arrive dashed (`262-777-6451`).

Both feed `merge_fraud_external()`, an additive-merge RPC — `supabase-js` upsert
can't express "add to the existing count", and a read-modify-write per number
would be thousands of round trips per file.

### Coverage caveat: Canada

**Neither regulator covers Canada, and no Canadian per-number equivalent exists.**
The CRTC and the Canadian Anti-Fraud Centre publish aggregates only. A Canadian
number appears in this index only when a US consumer happened to report it, so
thin Canadian coverage is structural, not a bug — and it's why first-party
detection is the part that matters for a Canadian-heavy customer base.

---

## 6a. What the Fraud tab shows

**Reporting a number** opens a form, not a bare prompt: number, category, and
*what happened*. The note is required and enforced server-side too (`manual`
reports are refused under 10 characters), because a hand-filed report blocks the
number for every workspace and that note is the record another operator reads
when they ask why one of their callers is getting a busy signal. Notes stay
workspace-private.

**The legend** (collapsed, above the list) is generated from `RISK_BANDS` in
`fraud.js`, so the thresholds it describes are the ones the chips use. It covers
the three bands, the weight of each kind of evidence, and — the point of the
whole page — that a risk score says what we know about a number, not what
happens to its calls. Unit tests pin the bands to the scores `riskScore()`
actually produces, so a weighting change that isn't reflected in the legend
fails the build.

The status chip is **viewer-relative** — it answers "what happens when this
number calls *me*", not just what the global row says. A number on your own
blocklist reads `BLOCKED HERE`, not `FLAGGED`; showing the global status alone
told a workspace nothing was happening to calls it was already rejecting.
Precedence: `ALLOWED HERE` → `BLOCKED EVERYWHERE` → `BLOCKED HERE` →
`PUBLIC COMPLAINTS` → `CLEARED` → `FLAGGED`.

| Band | Score | Means |
|------|-------|-------|
| High | 70–100 | Fraud confirmed in a call, usually corroborated |
| Elevated | 40–69 | Real but thinner — one detection, or several workspaces blocking |
| Low | 0–39 | One weak signal: a workspace mute, or complaints alone |

| Evidence | Weight |
|----------|--------|
| Fraud found in a call | 50, +5 per repeat, +8 per additional workspace |
| A workspace blocking the number | 12 each, capped at 30 |
| FTC/FCC consumer complaints | 5–25 by volume, never more |

**Search** covers the **entire database** — every number ever reported to us or
to the FTC/FCC — not the 7-day window the default view shows. Digits match
anywhere in the number, so an area code, the last four, or a full number in any
format all work; 3+ non-digit characters searches CNAM instead. Trigram GIN
indexes on both `e164` columns keep it an index scan (0.6ms across 310k rows);
without them every keystroke was a full-table scan. Results are paginated at
20/50/100 per page.

The list spans two tables, so it is paged as **one virtual list** — our own
entries first, then public-complaint rows — rather than interleaving two
independently-paged sources. `manage-fraud-numbers` works out how many slots a
page takes from each side (`fraudSkip`/`fraudTake`/`publicSkip`/`publicTake`)
and `range()`s both; unit tests cover the boundary case where a page straddles
the two, since getting it wrong either skips rows or repeats them. Changing the
page size returns to page 1, because the old page number means nothing at a new
size.

**Reported in the last 7 days** is a platform-wide feed: every report filed by
any workspace, from any source, with number, status, category, source, carrier
location and CNAM. Who filed it and their notes are not shared — a row reads
"another workspace". The public feeds move in bulk, so they appear as a count
("FTC/FCC refreshed N numbers") rather than thousands of rows.

Each list row carries the number, status, risk score, categories and a one-line
summary; **Details** expands to:

- **Carrier record** — city, state/prov, line type, LEC/CLEC, CNAM, plus OCN,
  LATA and LRN from the LERG lookup.
- **Evidence** — fraud reports, workspaces reporting, workspaces blocking,
  public complaint counts split FTC/FCC, complaint subjects, first seen, blocked
  since.
- **Recent activity** — a merged feed of reports and actual blocks
  (`fraud_block_events`), with relative times. Rows from other workspaces are
  anonymised to "another workspace".
- **Your own history** — how many calls this workspace took from the number
  before it was listed, and whether it's on your own blocklist.

Everything on the page is batched into one round of queries across the whole
list; a per-row fetch would be a request per number on a list that can run to
hundreds.

---

## 7. Cross-tenant boundary

The list is shared; the evidence is not.

| Shared with every workspace | Stays in the owning workspace |
|-----------------------------|-------------------------------|
| The number, its LERG/CNAM, categories, risk score | The transcript quote behind a report |
| How many workspaces reported it | Which workspace reported it |
| Public complaint counts | The call record it came from |

Enforced in the schema: `fraud_numbers` and `fraud_external_numbers` are
readable by any authenticated user; `fraud_reports` and `fraud_allowlist` are
RLS-scoped to `user_id`. `manage-fraud-numbers` returns `my_reports` only.

---

## 8. Schema

| Table | Purpose |
|-------|---------|
| `fraud_numbers` | The global list. One row per E.164. `status` = `blocked` / `flagged` / `cleared` |
| `fraud_reports` | Per-report evidence, workspace-scoped |
| `fraud_allowlist` | Per-workspace override of a global block |
| `fraud_external_numbers` | Bulk FTC + FCC complaint counts, one row per number |
| `fraud_external_sync` | Ingest cursors, so a long backfill resumes |
| `fraud_block_events` | One row per inbound rejected by the list — the Fraud tab's activity feed |
| `merge_fraud_external(source, rows)` | Additive merge RPC used by both syncs |

Applied directly to the live database, per this project's convention.

---

## 9. Operating it

```bash
# Deploy
./scripts/deploy-functions.sh sync-ftc-complaints sync-fcc-complaints \
  report-fraud-number manage-fraud-numbers \
  webhook-inbound-call webhook-inbound-sms webhook-inbound-whatsapp
```

The sync jobs are **cron-only** — they check the service-role key itself, since
`verify_jwt` alone would let any anon-key caller trigger a full backfill. Run
them by hand the way cron does:

```sql
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
         || '/functions/v1/sync-fcc-complaints',
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')),
  body := '{"pages": 40}'::jsonb, timeout_milliseconds := 240000);
```

Payloads: FTC takes `{backfill_days: N}` or `{date: "YYYY-MM-DD"}`; FCC takes
`{pages: N}` or `{since: "YYYY-MM-DD"}`.

```sql
-- Health
select source, cursor_value, last_status, rows_ingested, last_run_at from fraud_external_sync;
select count(*), sum(ftc_complaints), sum(fcc_complaints) from fraud_external_numbers;

-- Why was this number blocked?
select * from fraud_numbers where e164 = '+1...';
select * from fraud_reports where e164 = '+1...';   -- service role: all workspaces

-- Undo a bad global block
update fraud_numbers set status = 'cleared', cleared_at = now(), cleared_reason = '...' where e164 = '+1...';
```

---

## 10. Watch out

- **`FRAUD_CATEGORIES` is duplicated** in `agent.py` and `_shared/fraud.ts`.
  Drift silently coerces every category to `other`. A unit test pins it.
- **The FTC cursor advances only on success.** A missing day (holiday, publishing
  gap) is logged and skipped, and the next run resumes after the last success —
  but a *permanently* missing day will be retried forever. Check
  `fraud_external_sync.last_status` if the cursor stops moving.
- **The FCC dataset contains year-9999 issue dates.** One of them set the sync
  cursor to `9999-12-15` during the first backfill, after which
  `issue_date > cursor` matched nothing and the daily job would have ingested
  nothing forever, silently. The query now bounds `issue_date < now + 2 days`
  and the cursor ignores out-of-range dates, but the failure mode is worth
  knowing: **a sync that reports `ok` with rising `last_run_at` and a frozen
  cursor is not healthy.**
- **The merge is additive**, so re-ingesting a date double-counts. The cursor is
  the only thing preventing that; `{date: ...}` deliberately doesn't move it, so
  use it knowing the counts will inflate.
- **Blocking is global and immediate on first detection.** That is the product
  decision, and the guards plus the per-workspace allowlist are what make it
  survivable. If false positives show up, the first lever is
  `FRAUD_MIN_CONFIDENCE`, then `MAX_AUTO_BLOCKS_PER_HOUR`.
- **Outbound calls never report.** The number was dialled deliberately.
- **A burst of concurrent lookups gets rate-limited by SignalWire.** The first
  blocklist backfill fired 10 at once and every one came back empty — the
  numbers landed with no carrier data at all, silently, because enrichment
  failure is non-fatal by design. `signalwireLookup` now retries once on
  429/5xx/timeout, and bulk backfills should still be paced (`pg_sleep` between
  calls).

## 11. Review, ageing and disputes

### The review queue (Admin → Fraud)

Three things land in front of a person, because the automation deliberately
won't decide them:

| Source | Why it's here |
|--------|---------------|
| **Disputes** | A verified number owner says the listing is wrong |
| **Flagged** | Evidence exists but wasn't enough to block on its own |
| **Stale blocks** | Blocked long ago; nothing has tried to get through in 180 days |

Actions: `promote` (block everywhere), `clear` (unblock), `keep`,
`uphold_dispute`, `reject_dispute`. Anything that changes who gets through
requires a written reason. Every decision is written to `fraud_reviews` with
the admin's id — a global blocklist anyone can edit without a trace is a
liability, and this is the answer to "why is this number blocked" a year later.

### Ageing (`fraud-decay`, daily 10:15 UTC)

Phone numbers get reassigned. A line that ran a scam in 2024 may belong to a
dentist by 2026, and an append-only blocklist quietly becomes a list of
innocent people.

| Entry | What happens |
|-------|--------------|
| `flagged`, no fraud report, quiet 90 days | Auto-cleared |
| `blocked`, quiet 180 days, never fired | → review queue |
| Any entry | Risk score re-aged via `ageMultiplier()` |
| Public complaints, >24 months old and under 3 | Pruned from the index |

**It never silently unblocks.** A blocked entry is only ever moved in front of a
person. Ageing touches the displayed score, never `status`, so it cannot let a
caller through on its own.

### Disputes (`/fraud-dispute`, public)

The person whose number is blocked has no account here — often the whole
problem is that a scammer spoofed them and their real calls stopped landing. So
the form is public, which makes it the most abusable surface in the system: a
page on the open internet that un-lists numbers. Two things hold it shut:

1. **Control of the number is proved.** A six-digit code is texted *to* the
   disputed number (blocking is inbound-only, so we can still reach it) and has
   to be read back. Hashed with the number as salt, 10-minute expiry, 5 attempts,
   3 codes per number per day.
   The code is sent from **`MAGPIPE_MAIN_NUMBER` (+1 604 337 7899)** — the main
   line — never the country-routed notification senders. The recipient is not a
   customer and often has never heard of us, so it has to come from a verified
   number they can look up and call back, and the *same* number every time.
   Rotating senders would read exactly like the spam they're disputing.
2. **A verified dispute does not unblock anything.** It marks the entry
   `disputed`, sets `review_state = 'pending'`, and a person decides. Upholding
   is the only path that unblocks, and it takes an admin and a written reason.

Responses are deliberately uniform about whether a number is listed — otherwise
the endpoint becomes a way to probe the blocklist.

## 12. Not done

- Disputes are not emailed a decision — `contact_email` is captured and shown
  in the queue, but resolving one doesn't notify them yet.
- No rate limit by IP on `/fraud-dispute`, only by number.
- No commercial reputation feed (Hiya / TNS / TransUnion class). Revisit at
  scale — those are licensed scores, rented rather than owned.
