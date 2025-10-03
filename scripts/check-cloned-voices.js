import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mtxbiyilvgwhbdptysex.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.3HYm8O0PW2N2nW5VkNJkIw7XhEy85f-wFOKN8u2_0PM'
);

async function checkClonedVoices() {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('user_id, voice_id, cloned_voice_id, cloned_voice_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Agent configs:');
  console.table(data);
}

checkClonedVoices();
