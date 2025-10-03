# Update Retell Agent Voice

To update your Retell agent to use your cloned voice, run this in your browser console while logged into Pat:

```javascript
// Get current session
const { data: { session } } = await supabase.auth.getSession();

// Call the update function
const response = await fetch('https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/update-agent-voice', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  }
});

const result = await response.json();
console.log(result);
```

This will update your Retell agent to use the voice currently set in your agent_configs (Erik's Voice).
