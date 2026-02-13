/**
 * Balance check helper
 * Returns whether a user has sufficient credits to use paid services
 */
export async function checkBalance(
  supabase: any,
  userId: string
): Promise<{ allowed: boolean; balance: number }> {
  const { data: user, error } = await supabase
    .from('users')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  if (error || !user) {
    console.error('Balance check failed:', error?.message);
    return { allowed: false, balance: 0 };
  }

  const balance = user.credits_balance ?? 0;
  return {
    allowed: balance > 0,
    balance,
  };
}
