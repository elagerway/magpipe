# WhatsApp Business API — Findings & Lessons Learned

Everything learned setting up WhatsApp Business API integration for Magpipe / Site Super, from account setup through template delivery. Written to prevent repeating the same mistakes.

---

## 1. Account Structure

### Key IDs you need
| ID | What it is | Where to find it |
|----|-----------|-----------------|
| **WABA ID** (WhatsApp Business Account) | The business account that owns phone numbers and templates | Meta Business Manager → WhatsApp Accounts |
| **Phone Number ID** | Meta's internal ID for the specific WhatsApp number | Meta Business Manager → Phone Numbers, or API: `GET /{waba_id}/phone_numbers` |
| **System User Token** | Long-lived access token for API calls | Meta Business Manager → System Users → Generate Token |
| **Business ID** | The parent Meta Business | Meta Business Manager → Business Settings |

### Critical distinction: WABA ID ≠ Business ID
- **WABA ID** (`3026433170887493`) is what you use for template management and phone number queries
- **Business ID** (`1235375900144772`) is the parent Snapsonic business — NOT used for template API calls
- Confusing these causes silent failures — API calls to the wrong ID return empty data or errors

### Our setup (Site Super)
- **WABA**: `3026433170887493` (Site Super)
- **Phone Number ID**: `1047232108475031`
- **Phone**: `+16043731965`
- **Display name**: Snapsonic Site Reporting
- **Business**: Snapsonic (`1235375900144772`)
- **Verification**: Business verified, account review status APPROVED

---

## 2. Access Token

### Use a System User token, NOT a page/user token
- Page tokens expire in ~60 days
- User tokens expire when the user's password changes or session expires
- **System User tokens are permanent** (don't expire unless manually revoked)
- Generate in: Meta Business Manager → System Users → Add System User → Generate New Token
- Required permissions: `whatsapp_business_management`, `whatsapp_business_messaging`

### Token storage
- Store in `whatsapp_accounts.access_token` in the DB
- Never store in frontend or edge function env vars — it's per-account and changes per customer
- Token is write-only once stored (can't read it back from the UI)

### Verifying a token
```bash
curl "https://graph.facebook.com/v21.0/{phone_number_id}?fields=display_phone_number,status,quality_rating" \
  -H "Authorization: Bearer {token}"
```
If it returns `status: CONNECTED` the token is valid and the number is live.

---

## 3. Phone Number Registration

### Registration is a one-time step
Before a number can send messages, it must be registered with Meta via:
```bash
POST https://graph.facebook.com/v21.0/{phone_number_id}/register
{
  "messaging_product": "whatsapp",
  "pin": "123456"
}
```

### Two-step verification
- If Meta has two-step verification enabled on the number, registration requires the PIN
- If you don't know the PIN, disable two-step verification in Meta Business Manager first:
  Meta Business Manager → WhatsApp Accounts → Phone Numbers → Settings → Two-Step Verification → Disable
- After disabling, registration succeeds without a PIN

### Verifying registration
```bash
GET https://graph.facebook.com/v21.0/{phone_number_id}?fields=status
```
Should return `"status": "CONNECTED"`.

---

## 4. Webhook Subscription

After connecting a WABA, subscribe to webhooks so inbound messages are received:
```bash
POST https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps
Authorization: Bearer {token}
```
Returns `{"success": true}`. This only needs to be done once per WABA.

Our webhook URL: `https://api.magpipe.ai/functions/v1/webhook-inbound-whatsapp`

---

## 5. Sending Messages — the `to` Field

### Strip the `+` before sending to Meta
Meta's Cloud API expects the recipient's WhatsApp ID **without** the leading `+`:
```
✅ "16045628647"    ← correct
❌ "+16045628647"   ← Meta accepts this and returns a wamid but silently fails delivery
```

Meta will return a valid `wamid` with `message_status: accepted` even for the `+` format — it does NOT return an error. The message is silently dropped. This is a known Meta quirk.

**Fix in code:**
```typescript
const waId = to.replace(/^\+/, '')
```

---

## 6. Templates — Category Rules (CRITICAL)

### The three categories
| Category | Use case | Opt-in required | Cost |
|----------|----------|-----------------|------|
| **UTILITY** | Transactional notifications, follow-ups on existing relationship | No | Low |
| **MARKETING** | Promotions, offers, cold outreach | Yes (explicit opt-in) | High |
| **AUTHENTICATION** | OTPs only | No | Low |

### MARKETING templates are silently dropped
- Meta returns a `wamid` with `message_status: accepted` — no error
- Message never arrives on the recipient's phone
- This happens when the recipient hasn't explicitly opted in to marketing messages
- **The API gives no indication of delivery failure**

### What qualifies as UTILITY
Must reference a **specific prior event or transaction**:
- Appointment reminders or follow-ups
- Order/shipment status updates
- Report completion follow-ups
- Issue resolution updates
- Feedback requests tied to a specific service event

### What gets auto-recategorized to MARKETING
Meta auto-classifies templates. Triggers for reclassification:
- Cold outreach language ("reaching out", "would you mind if")
- No reference to a specific prior event
- Promotional words ("exclusive", "offer", "save", "free")
- CTA buttons labeled "Buy", "Shop", "Order"
- Bare floating variables with no surrounding context

### Our mistake
Created `site_report_opener` as MARKETING:
```
"Hey there, this is your friendly Site Super reporting agent reaching out. Would you mind if I asked you a few questions regarding a new site report?"
```
This reads as cold outreach → MARKETING → silently dropped. **Never delivered.**

### The fix — UTILITY-safe wording
Reference a specific prior event and state the operational purpose:
```
"Hi {{1}}, we are following up on your Site Super report at {{2}} on {{3}}. Our assistant has a few short questions to complete the report - please reply Start to continue."
```

### 4-week cooldown on name reuse
If you delete a template and try to recreate it with a different category using the same name, Meta blocks it for **4 weeks**:
> "You can't change the category for this message template while the existing English (US) content is being deleted. Try again in 4 weeks or use MARKETING as the category."

**Always use a new template name if you need to change category.**

### Template deletion propagation delay
After deleting a template via API, you cannot immediately recreate it with the same name. Meta's deletion propagates over ~2–3 minutes. If you try to recreate too soon:
> "New English (US) content can't be added while the existing English (US) content is being deleted."

**Use a new name rather than waiting.**

---

## 7. Templates — Variable Format

### Two variable formats exist
| Format | Syntax | Set via |
|--------|--------|---------|
| **POSITIONAL** | `{{1}}`, `{{2}}`, `{{3}}` | API or UI |
| **NAMED** | `{{customer_name}}`, `{{date}}` | Meta's pre-built template library (UI only) |

### WABA variable format restriction
This WABA (`3026433170887493`) rejects templates with `{{1}}` variables when created via the API (`INVALID_FORMAT`). However the same WABA accepts templates with variables when created through Meta Business Manager UI using pre-built templates.

This appears to be a WABA maturity/verification restriction — newer or less-established WABAs may have API-side restrictions on variable templates. Always test via API first; fall back to UI if variables are rejected.

### Pre-built templates bypass the restriction
Meta Business Manager has a library of pre-approved template structures. Selecting one and customizing the text (using "Customize template") produces an approved UTILITY template that supports variables. This is the reliable path for new WABAs.

---

## 8. Templates — Component Structure for Sending

When sending a template with variables, pass a `components` array:

### Body variables
Parameters fill `{{1}}`, `{{2}}`, etc. **positionally** in order:
```json
{
  "type": "body",
  "parameters": [
    { "type": "text", "text": "John" },
    { "type": "text", "text": "Site Super" },
    { "type": "text", "text": "March 20" }
  ]
}
```

### Header variables
```json
{
  "type": "header",
  "parameters": [
    { "type": "text", "text": "Site Report" }
  ]
}
```

### URL button variables
Buttons require `sub_type` and `index` (zero-based button position):
```json
{
  "type": "button",
  "sub_type": "url",
  "index": "0",
  "parameters": [
    { "type": "text", "text": "report/a8f3k2m9" }
  ]
}
```

### Complete example (body + button)
```json
[
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "John" },
      { "type": "text", "text": "Site Super" },
      { "type": "text", "text": "March 20" },
      { "type": "text", "text": "2:00 PM" }
    ]
  },
  {
    "type": "button",
    "sub_type": "url",
    "index": "0",
    "parameters": [
      { "type": "text", "text": "report/a8f3k2m9" }
    ]
  }
]
```

---

## 9. Approved Templates (Site Super WABA)

| Template name | Category | Status | Variables | Notes |
|---------------|----------|--------|-----------|-------|
| `upcoming_site_report` | UTILITY | ✅ APPROVED | Body: `{{1}}` name, `{{2}}` company, `{{3}}` date, `{{4}}` time. Button: `{{1}}` URL suffix | Best for proactive outreach |
| `missed_site_report_call` | UTILITY | ✅ APPROVED | Body: `{{1}}` name | Simple missed-call follow-up |
| `missed_report_call` | UTILITY | PENDING | Body: `{{1}}–{{4}}`, original missed_appointment copy | Do not use — wrong body text |
| `site_report_start` | UTILITY | PENDING | None | No variables, simple opener |
| `site_report_opener` | MARKETING | DELETED | None | Silently dropped — never delivered |
| `hello_world` | UTILITY | ✅ APPROVED | None | Meta default test template |

---

## 10. DB — `whatsapp_accounts` Table

| Column | Notes |
|--------|-------|
| `phone_number_id` | Meta's phone number ID — used in API calls (`/v21.0/{phone_number_id}/messages`) |
| `waba_id` | WABA ID — used for template fetching (`/v21.0/{waba_id}/message_templates`) |
| `access_token` | System User token |
| `agent_id` | The Magpipe agent this number is assigned to |
| `is_active` | Filter by this in all queries |

### Common mistake: wrong waba_id stored
Our account had `waba_id: 2373552683145135` stored but the actual WABA is `3026433170887493`. This caused:
- Template body fetch returning empty (wrong WABA)
- `[Template: site_report_opener]` placeholder stored in inbox instead of real text

To verify which WABA owns a phone number:
```bash
GET https://graph.facebook.com/v21.0/{waba_id}/phone_numbers
```
Check if `phone_number_id` appears in the response.

---

## 11. Useful Meta API Calls

```bash
# Check phone number status
GET /v21.0/{phone_number_id}?fields=display_phone_number,status,quality_rating,messaging_limit_tier,account_mode

# List phone numbers in a WABA
GET /v21.0/{waba_id}/phone_numbers?fields=id,display_phone_number,status

# List templates in a WABA
GET /v21.0/{waba_id}/message_templates?fields=name,status,category,components,rejected_reason

# Get specific template
GET /v21.0/{waba_id}/message_templates?name=your_template_name&fields=name,status,category,components,rejected_reason

# Create template (UTILITY)
POST /v21.0/{waba_id}/message_templates
{ "name": "...", "language": "en_US", "category": "UTILITY", "components": [...] }

# Delete template
DELETE /v21.0/{waba_id}/message_templates?name=your_template_name

# Send template message
POST /v21.0/{phone_number_id}/messages
{ "messaging_product": "whatsapp", "to": "16045628647", "type": "template", "template": { "name": "...", "language": { "code": "en_US" }, "components": [...] } }

# Subscribe webhooks
POST /v21.0/{waba_id}/subscribed_apps
```

---

## 12. Key Gotchas Summary

| Gotcha | Impact | Fix |
|--------|--------|-----|
| MARKETING template | Message silently accepted by Meta but never delivered | Use UTILITY for all business notifications |
| `+` in `to` field | Silent delivery failure — wamid returned but message dropped | Strip `+` before sending: `to.replace(/^\+/, '')` |
| Wrong `waba_id` in DB | Template body fetch returns empty → placeholder stored in inbox | Verify waba_id by listing phone numbers under each WABA |
| Template name 4-week cooldown | Can't reuse name with different category for 4 weeks | Always use a new name when changing category |
| Deletion propagation | Can't recreate same-name template for ~2–3 min after delete | Use a new name instead of waiting |
| WABA variable restriction | API rejects `{{1}}`-style variables on some WABAs | Use Meta Business Manager UI with pre-built templates |
| System user token | Page/user tokens expire, break everything silently | Always use System User permanent tokens |
| Button component format | Missing `sub_type` and `index` causes Meta to reject the send | Include `sub_type: "url"` and `index: "0"` for URL buttons |
