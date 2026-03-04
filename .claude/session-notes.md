# Session Notes — March 2, 2026 (Session 2)

## Contact Form File Upload — IN PROGRESS
Adding image + video attachments to the "Get in Touch" contact form.

### Plan (approved)
1. Update `support-attachments` bucket: add video MIME types + increase 5MB → 25MB
2. Add file input UI (paperclip button, thumbnails, max 3 files) to both contact form instances in `BottomNav.js`
3. Wire `submitContactForm()` to upload to storage + send attachments array
4. Update `send-contact-email` edge function to accept attachments + include in email HTML
5. Add CSS for attachment previews in `public/styles/main.css`

### Completed
- Migration file created: `supabase/migrations/20260302_support_attachments_video.sql`
  - Adds `video/mp4`, `video/quicktime`, `video/webm` to allowed MIME types
  - Increases `file_size_limit` to 25MB (26214400 bytes)
  - **APPLIED** via Supabase MCP `execute_sql`
- **BottomNav.js UI** — paperclip "Attach files" button, hidden file input, thumbnail previews with remove buttons (both mobile + desktop forms)
- **submitContactForm()** — uploads files to `support-attachments` bucket, passes attachments array to edge function
- **send-contact-email edge function** — renders image thumbnails + video links in HTML email, stores attachments JSONB in support_tickets
- **CSS styles** — `.contact-attachments`, `.attach-btn`, `.attachment-thumb`, `.attachment-previews` in `main.css`

### Not Yet Deployed
- Edge function `send-contact-email` needs redeployment
- Frontend changes need `npx vercel --prod` or commit+push

### Key Files
- `src/components/BottomNav.js` — contact form (two instances: mobile + desktop, lines ~756 and ~1154)
- `supabase/functions/send-contact-email/index.ts` — edge function
- `public/styles/main.css` — CSS (contact-modal styles around line 992)
- Existing upload pattern: `src/pages/contacts.js` lines 637-651 (avatar upload to Supabase storage)

### MCP Servers — INSTALLED
Added missing MCPs to `~/.claude.json` for pat project:
- Supabase (`https://mcp.supabase.com/mcp`)
- Playwright (`@playwright/mcp@latest`)
- Vercel (`https://mcp.vercel.com`)
- Stripe (`@stripe/mcp`)
- Postmark (`@activecampaign/postmark-mcp`)
- (Magpipe + Hostinger already existed)
- **Requires Claude Code restart** to connect

## Previous Session (same day)

### Status Page Feature (Full Build)
- `status.magpipe.ai` — 13 service checks, 90-day uptime bars, VPS 62.72.7.119

### Commits (earlier today)
1. `210edd6` — Timezone-aware history, local time, form repositioned
2. `d75f125` — Chat message limit 100 → 1000
3. `3928c64` — Rotate leaked secrets
4. `1a9ee56` — Status page docs, session notes, Mintlify nav
5. `aaed6e1` — Rebrand outbound email: info@ → help@
