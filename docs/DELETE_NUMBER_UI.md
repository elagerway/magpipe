# Delete Number UI Feature

## Overview

Added delete button to phone number cards in the `/manage-numbers` page with confirmation modal.

## User Experience

### Delete Button
- **Location**: Bottom right of each number card
- **Color**:
  - **Grey** when number is ACTIVE (disabled)
  - **Red** when number is INACTIVE (enabled)
- **State**: Disabled when number is active to prevent accidental deletion
- **Tooltip**:
  - Active: "Deactivate number before deleting"
  - Inactive: "Delete this number"

### Deletion Flow

1. **User clicks Delete button** on inactive number
2. **Confirmation modal appears**:
   - Title: "Delete Phone Number?"
   - Message: "Are you sure you want to delete [formatted number]?"
   - Warning: "This number will be deactivated immediately and permanently deleted in 30 days."
   - Buttons:
     - **Cancel** (grey) - Closes modal, no action
     - **Yes, Delete** (red) - Confirms deletion

3. **After confirmation**:
   - Number is deactivated (if not already)
   - Number is moved to `numbers_to_delete` table
   - Scheduled for permanent deletion in 30 days
   - Success message: "Number queued for deletion. It will be permanently deleted in 30 days."
   - Number list refreshes

## Technical Implementation

### Files Modified

**`src/pages/manage-numbers.js`**
- Added delete button to `renderNumberCard()` method
- Added confirmation modal to page HTML
- Added `showDeleteModal()` method
- Added `deleteNumber()` method
- Added `attachModalListeners()` method
- Updated `renderNumbers()` to attach delete button listeners

**`public/styles/modal.css`**
- Added `.modal-backdrop` styles for clickable background
- Updated `.modal-content` with proper styling

**`supabase/functions/queue-number-deletion/index.ts`**
- Updated to accept authenticated user via session token
- Maintains backward compatibility with email parameter for scripts

### Edge Function Call

```javascript
const response = await fetch(`${supabaseUrl}/functions/v1/queue-number-deletion`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    email: user.email,
    phone_numbers: [number.phone_number]
  }),
});
```

### Button Styling

```javascript
style="
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  background: ${number.is_active ? '#9ca3af' : '#ef4444'};
  border-color: ${number.is_active ? '#9ca3af' : '#ef4444'};
  color: white;
  cursor: ${number.is_active ? 'not-allowed' : 'pointer'};
  opacity: ${number.is_active ? '0.6' : '1'};
"
${number.is_active ? 'disabled' : ''}
```

## Security

- **Authentication required**: Uses user session token
- **User ownership verified**: Edge function validates user owns the number
- **RLS policies**: Database policies prevent unauthorized access
- **Confirmation required**: Modal prevents accidental deletions

## Database Changes

No new tables or migrations needed. Uses existing:
- `numbers_to_delete` table (created in migration 058)
- `queue-number-deletion` Edge Function

## Testing Checklist

- [ ] Delete button appears on all number cards
- [ ] Button is grey/disabled when number is active
- [ ] Button is red/enabled when number is inactive
- [ ] Clicking delete on active number does nothing
- [ ] Clicking delete on inactive number shows modal
- [ ] Modal displays correct phone number
- [ ] Cancel button closes modal without action
- [ ] Clicking backdrop closes modal
- [ ] Yes, Delete button queues number for deletion
- [ ] Success message appears after deletion
- [ ] Number list refreshes automatically
- [ ] Number becomes inactive after deletion
- [ ] Number appears in `numbers_to_delete` table
- [ ] Scheduled deletion date is 30 days from now

## Related Documentation

- [Phone Number Deletion System](./PHONE_NUMBER_DELETION.md)
- Session Notes: See 2025-10-24 session

## Deployment

Files updated:
- ✅ `src/pages/manage-numbers.js` (client-side, auto-deployed)
- ✅ `public/styles/modal.css` (client-side, auto-deployed)
- ✅ `supabase/functions/queue-number-deletion/index.ts` (deployed)

No database migrations needed.
