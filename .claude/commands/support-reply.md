---
description: Draft and send a reply to a Magpipe support ticket
---

Draft and send a reply to a support ticket. Arguments (if provided): ticket reference or customer name to look up.

$ARGUMENTS

Follow ALL steps in order.

---

## Step 1 — Find the ticket thread

Search Gmail for the relevant ticket using the Gmail MCP tool (`gmail_search_messages`). Use the customer name, ticket number, or subject from the arguments. If no arguments given, look for the most recent unread support ticket.

From the email thread, extract:
- `threadId` — the support ticket thread ID, found in the email body or subject (format: TKT-XXXXXX maps to a DB thread_id; prefer to find it via Step 2)
- The customer's name and email
- The full context of the conversation so far (read the thread with `gmail_read_thread`)

---

## Step 2 — Look up the thread_id in the database

Run this query to find the correct thread_id (used for sending the reply):

```bash
source .env && curl -s "https://mtxbiyilvgwhbdptysex.supabase.co/rest/v1/support_tickets?select=thread_id,from_email,from_name,subject,created_at&order=created_at.desc&limit=50" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Match on `from_email` or `subject` to find the right `thread_id`.

---

## Step 3 — Draft the reply

Write a concise, friendly reply as Erik from Magpipe. Keep it short. Sign off as "Erik".

Show the draft to the user and ask: **"Send this reply?"**

Wait for confirmation before proceeding.

---

## Step 4 — Send via support-tickets-api

Once confirmed, send the reply using the service role key:

```bash
source .env && curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/support-tickets-api" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_reply",
    "threadId": "<thread_id from Step 2>",
    "replyBody": "<plain text reply>",
    "replyBodyHtml": "<plain text reply with <br> for newlines>"
  }'
```

Report success or any error back to the user.
