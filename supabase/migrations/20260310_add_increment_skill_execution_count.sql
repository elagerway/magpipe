CREATE OR REPLACE FUNCTION increment_skill_execution_count(skill_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE agent_skills
  SET
    execution_count = execution_count + 1,
    last_executed_at = now()
  WHERE id = skill_id;
$$;
