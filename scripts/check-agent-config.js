// Run this in browser console while logged in to Pat

const { data: { session } } = await supabase.auth.getSession();
const { data: { user } } = await supabase.auth.getUser();

console.log('User ID:', user.id);

// Get agent config
const { data: config, error } = await supabase
  .from('agent_configs')
  .select('*')
  .eq('user_id', user.id)
  .single();

console.log('Agent Config:', config);
console.log('Error:', error);

// Also check voices table
const { data: voices } = await supabase
  .from('voices')
  .select('*')
  .eq('user_id', user.id);

console.log('Voices:', voices);
