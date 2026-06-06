/**
 * Server-side Cloudflare Turnstile token verification.
 * Call from any edge function that receives a turnstileToken from the client.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string | undefined | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) {
    if (Deno.env.get('TURNSTILE_DISABLED') === 'true') {
      console.warn('Turnstile verification disabled by TURNSTILE_DISABLED flag');
      return true;
    }
    console.error('TURNSTILE_SECRET_KEY not set — rejecting request');
    return false;
  }
  if (!token) return false;

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Turnstile verification failed:', data['error-codes']);
    }
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return false;
  }
}
