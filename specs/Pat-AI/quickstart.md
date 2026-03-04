# Quickstart Guide: Pat AI Call & SMS Agent PWA

## Overview
This guide walks through the complete end-to-end user journey for Pat, from registration to receiving and handling calls/SMS. Use this as validation that all features work as expected.

## Prerequisites
- Modern web browser (Chrome 90+, Safari 14+, or Firefox 88+)
- Mobile device or browser with mobile emulation for best PWA experience
- Test phone number for verification
- Email address for registration

## Test Scenario 1: User Registration and Setup

### Step 1: Registration
1. **Navigate** to the app URL: `https://pat.example.com`
2. **Click** "Get Started" or "Sign Up"
3. **Choose** registration method:
   - **Option A: Email/Password**
     - Enter name: "Jane Doe"
     - Enter email: "jane@example.com"
     - Enter password: "SecurePass123!" (min 8 characters)
     - Click "Sign Up"
   - **Option B: SSO**
     - Click "Continue with Google" (or Github/Facebook/LinkedIn)
     - Complete OAuth flow
     - Authorize app access

**Expected Result**:
- Confirmation message: "Check your email for a verification code"
- Email sent to provided address with 6-digit code

### Step 2: Email Verification
1. **Check** email inbox for verification code
2. **Enter** 6-digit code in verification form
3. **Click** "Verify Email"

**Expected Result**:
- Success message: "Email verified!"
- Automatic redirect to phone number entry screen

### Step 3: Phone Number Verification
1. **Enter** phone number in E.164 format: "+14155552671"
2. **Click** "Send Verification Code"
3. **Check** SMS on test phone for 6-digit code
4. **Enter** code in verification form
5. **Click** "Verify Phone"

**Expected Result**:
- Success message: "Phone verified!"
- Automatic redirect to service number selection screen

### Step 4: Service Number Selection
1. **Enter** area code or select region: "415" or "San Francisco, CA"
2. **Click** "Search Available Numbers"
3. **View** list of available phone numbers in that area (e.g., +14155559876, +14155559877, +14155559878)
4. **Select** preferred number by clicking on it
5. **Click** "Confirm Selection"

**Expected Result**:
- Confirmation message: "Your Pat number is +14155559876"
- Number is provisioned and linked to user's account
- Display shows both user's personal number and selected service number
- Automatic redirect to agent configuration screen

### Step 5: Configure Pat Agent
1. **View** welcome screen with Pat introduction
2. **Choose** configuration method:
   - **Option A: Text Configuration**
     - Type: "I want you to screen all unknown callers and ask for their name and reason for calling"
     - Type: "Transfer whitelisted contacts immediately"
     - Click "Save Configuration"
   - **Option B: Voice Configuration**
     - Click microphone icon
     - Speak: "Hi Pat, I want you to handle my calls professionally and screen unknowns"
     - Listen to Pat's response confirming understanding
     - Speak: "Yes, that's correct"

**Expected Result**:
- Agent configuration saved
- Pat responds: "I understand. I'll screen unknown callers and transfer your trusted contacts. Is there anything else you'd like me to know?"
- Button: "Continue to Dashboard"

### Step 6: Add Contacts
1. **Navigate** to Contacts section
2. **Choose** contact import method:
   - **Option A: Contact Picker (Chrome/Android)**
     - Click "Import from Phone"
     - Select 3-5 contacts from picker
     - Click "Add Selected"
   - **Option B: Manual Entry**
     - Click "Add Contact"
     - Enter name: "John Smith"
     - Enter phone: "+14155553333"
     - Mark as whitelisted: ✓
     - Click "Save"

**Expected Result**:
- Contacts appear in list
- Each contact shows name, phone, whitelist status
- Message: "3 contacts added successfully"

## Test Scenario 2: Inbound Call from Whitelisted Contact

### Setup
- Ensure "John Smith" (+14155553333) is in contacts and whitelisted
- User's Pat number: +14155559876

### Execution
1. **Call** the Pat number (+14155559876) from John's phone (+14155553333)
2. **Wait** for Pat to answer (should be <3 rings)
3. **Listen** to Pat's greeting: "Hi John, this is Pat. How can I help you?"
4. **Speak**: "Hi Pat, is Jane available?"
5. **Listen** to Pat's response: "Let me check if she's available. One moment."
6. **Wait** for call transfer

**Expected Results**:
- Call answered within 2-3 rings
- Pat recognizes John by name (contact lookup worked)
- Pat initiates transfer to Jane's actual phone number
- Jane receives incoming call with caller ID showing John's number
- Call connects successfully

### Verification in App
1. **Open** Pat PWA
2. **Navigate** to Call History
3. **View** latest call record
4. **Verify** details:
   - Contact: John Smith
   - Duration: ~45 seconds
   - Disposition: "Transferred to User"
   - Timestamp: Current time
   - Recording: Available for playback
5. **Click** Play button to hear recording
6. **Read** transcript of conversation

## Test Scenario 3: Inbound Call from Unknown Caller

### Setup
- Use test phone NOT in contacts: +14155554444

### Execution
1. **Call** Pat number from unknown phone
2. **Wait** for Pat to answer
3. **Listen** to Pat: "Hello, this is Pat, Jane's assistant. May I ask who's calling?"
4. **Respond**: "This is Bob from Acme Corp"
5. **Listen**: "Thanks Bob. What can I help you with today?"
6. **Respond**: "I'd like to discuss a business opportunity with Jane"
7. **Listen**: Pat evaluates against vetting criteria
8. **Expected Pat Response**: "I'll let Jane know you called. Can I take a message or would you prefer she calls you back?"
9. **Respond**: "I'll call back later"
10. **Listen**: "No problem, Bob. Have a great day!"

**Expected Results**:
- Pat screens unknown caller successfully
- Asks for name and reason (per configuration)
- Does NOT transfer call (unknown caller, not emergency)
- Call ends gracefully with professional message

### Verification in App
1. **Check** Call History
2. **View** screening record:
   - Contact: Unknown (Bob from Acme Corp)
   - Phone: +14155554444
   - Duration: ~30 seconds
   - Disposition: "Screened Out"
   - Screening Notes: "Caller: Bob from Acme Corp. Purpose: Business opportunity. Did not transfer."
3. **Review** transcript and recording

### Optional: Add Screened Caller to Contacts
1. **Click** "Add to Contacts" button on call record
2. **Fill** name: "Bob Johnson - Acme Corp"
3. **Set** whitelist: Unchecked (manual review first)
4. **Save** contact

## Test Scenario 4: Inbound SMS from Whitelisted Contact

### Setup
- John Smith (+14155553333) is whitelisted contact

### Execution
1. **Send SMS** from John's phone to Pat number (+14155559876):
   ```
   "Hey, can you send me Jane's email address?"
   ```
2. **Wait** for Pat's response (should be <2 seconds)
3. **Receive** SMS reply from Pat:
   ```
   "Hi John! Jane's email is jane@example.com. Is there anything else I can help you with?"
   ```
4. **Reply**:
   ```
   "No, that's all. Thanks!"
   ```
5. **Receive** Pat's response:
   ```
   "You're welcome! Have a great day."
   ```

**Expected Results**:
- Pat responds within 2 seconds
- Uses conversation history (knows John's name)
- Provides helpful information
- Natural, context-aware responses

### Verification in App
1. **Navigate** to SMS History
2. **View** conversation thread with John
3. **Verify**:
   - All messages displayed in correct order
   - Timestamps accurate
   - Message status: "Delivered"
   - Context: Pat referenced previous interactions

## Test Scenario 5: Inbound SMS from Unknown Number

### Setup
- Test from unknown number: +14155557777

### Execution
1. **Send SMS** from unknown number to Pat:
   ```
   "Is this Jane?"
   ```
2. **Wait** for Pat's response
3. **Receive** SMS:
   ```
   "Hello! This is Pat, Jane's assistant. May I ask who's trying to reach her?"
   ```
4. **Reply**:
   ```
   "This is Sarah, her cousin"
   ```
5. **Receive** Pat's response:
   ```
   "Thanks Sarah! I'll let Jane know you reached out. She'll get back to you soon."
   ```

**Expected Results**:
- Pat vets unknown SMS sender
- Asks for identification
- Does not share sensitive information
- Professional but friendly tone

### Verification in App
1. **Check** SMS History
2. **View** conversation with unknown sender
3. **Optional**: Add Sarah to contacts as "Sarah (Cousin)"

## Test Scenario 6: Viewing History and Playback

### Execution
1. **Navigate** to Dashboard
2. **View** recent activity summary:
   - Total calls today: 2
   - Total SMS today: 2
   - Unknown contacts screened: 1
3. **Click** "View All Calls"
4. **Filter** by:
   - Date range: Today
   - Contact: "All"
   - Disposition: "All"
5. **Sort** by: Most Recent
6. **Select** John Smith's transferred call
7. **Click** Play Recording
   - Audio plays in browser
   - Playback controls: play/pause, seek, speed
8. **View** Transcript:
   - Timestamped dialogue
   - Speaker labels (Pat, John, Jane)
9. **Search** transcript for keyword: "available"
   - Highlights matching text
10. **Export** call data:
    - Click "Export"
    - Choose format: JSON
    - Downloads call record with transcript

## Test Scenario 7: Offline Mode

### Execution
1. **Ensure** app has been used online (cached data exists)
2. **Enable** airplane mode or disconnect internet
3. **Open** PWA (should open from home screen if installed)
4. **Navigate** to Call History
   - Previously loaded calls visible
   - Can play cached recordings
   - Can read transcripts
5. **Try** to make changes:
   - Add new contact → Shows "Offline" message
   - Update config → Shows "Will sync when online"
6. **Reconnect** internet
7. **Verify** sync:
   - "Syncing..." indicator appears
   - Changes from online session appear
   - No data loss

## Test Scenario 8: Agent Configuration Update

### Execution
1. **Navigate** to Settings > Agent Configuration
2. **Update** greeting template:
   - Change from: "Welcome {name}, my name is Pat..."
   - To: "Hi there! I'm Pat, {user_name}'s AI assistant..."
3. **Modify** vetting criteria:
   - Add auto-transfer keyword: "family emergency"
   - Add auto-reject keyword: "extended warranty"
4. **Change** response style:
   - From: "Professional"
   - To: "Friendly"
5. **Update** quiet hours:
   - Start: 22:00
   - End: 08:00
6. **Save** changes
7. **Test** with new call:
   - Call from test number
   - Verify Pat uses new greeting
   - Verify friendly tone in responses

## Success Criteria

✅ **Registration Flow**:
- Email and SSO registration work
- Email verification required
- Phone verification via SMS works
- User receives assigned Pat number

✅ **Agent Configuration**:
- Text and voice configuration both work
- Settings persist across sessions
- Changes take effect immediately

✅ **Call Handling**:
- Whitelisted contacts transferred automatically
- Unknown callers screened appropriately
- Conversations feel natural and contextual
- Recordings and transcripts saved correctly

✅ **SMS Handling**:
- Whitelisted contacts get personalized responses
- Unknown senders vetted before sharing info
- Response time <2 seconds
- Context from past messages maintained

✅ **History & Playback**:
- All interactions logged correctly
- Recordings playable in-browser
- Transcripts searchable
- Data exports work

✅ **PWA Features**:
- Installable to home screen
- Offline viewing of history works
- Online/offline sync works correctly
- Performance meets targets (<500ms responses, <3 ring answer)

✅ **UX Consistency**:
- Error messages actionable
- Loading states clear
- Mobile-friendly interface
- Consistent navigation patterns

## Troubleshooting

### Call Not Answered
- Check SignalWire number configuration
- Verify webhook URLs set correctly
- Check Retell.ai agent is active

### SMS Not Received
- Verify phone number in E.164 format
- Check SignalWire SMS webhook configuration
- Ensure Supabase Edge Function deployed

### Recording Not Available
- Check Supabase Storage permissions
- Verify recording URL in database
- Check SignalWire recording settings

### Context Not Used
- Verify conversation_contexts table populated
- Check pgvector extension enabled
- Verify embeddings generated correctly

---

**Quickstart Validation**: Run through all scenarios to confirm MVP is ready for user testing.