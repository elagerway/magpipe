/**
 * Shared Cal.com v2 helpers.
 *
 * Single source of truth for listing event types — previously duplicated in
 * cal-com-get-slots (twice) and mcp-execute. Pinned to cal-api-version 2024-06-14,
 * which returns a FLAT `{ data: [...] }` array; WITHOUT the header the API returns a
 * grouped `{ data: { eventTypeGroups: [...] } }` shape. The Array.isArray guard means
 * callers never crash on `.map` if the shape ever drifts. (#100/#102 review)
 */

export interface CalEventType {
  id: number
  slug: string
  title: string
  length: number
}

export async function fetchCalEventTypes(accessToken: string): Promise<CalEventType[]> {
  const res = await fetch('https://api.cal.com/v2/event-types', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'cal-api-version': '2024-06-14',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Cal.com event-types API error (${res.status}): ${body}`)
  }
  const data = await res.json()
  const list = Array.isArray(data?.data) ? data.data : []
  // `??` (not `||`) so a legitimate lengthInMinutes of 0 isn't discarded.
  return list.map((et: Record<string, unknown>) => ({
    id: et.id as number,
    slug: et.slug as string,
    title: et.title as string,
    length: (et.lengthInMinutes ?? et.length) as number,
  }))
}

/**
 * Refresh a Cal.com OAuth access token.
 *
 * The refresh endpoint is `/api/auth/oauth/refreshToken` — NOT
 * `/api/auth/oauth/token`, which implements `authorization_code` and nothing
 * else and answers every refresh with `400 {"error":"invalid_request"}`.
 * Three call sites had the wrong URL, so no Cal.com token has successfully
 * refreshed since the first one expired, and the Booking Settings modal has
 * been reporting it as "No event types found."
 *
 * Form-encoded. `client_secret` is optional for this grant (the
 * authorization_code exchange is PKCE and sends none), so it is only included
 * when it's set to something other than the client id — CAL_COM_CLIENT_SECRET
 * currently holds a copy of CAL_COM_CLIENT_ID, and sending that is worse than
 * sending nothing.
 */
export class CalTokenError extends Error {
  constructor(message: string, readonly invalidGrant: boolean) {
    super(message)
    this.name = 'CalTokenError'
  }
}

export interface CalTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

export async function refreshCalToken(refreshToken: string): Promise<CalTokens> {
  const clientId = Deno.env.get('CAL_COM_CLIENT_ID')
  if (!clientId) throw new Error('CAL_COM_CLIENT_ID is not configured')

  const params: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  }
  const clientSecret = Deno.env.get('CAL_COM_CLIENT_SECRET')
  if (clientSecret && clientSecret !== clientId) params.client_secret = clientSecret

  const res = await fetch('https://app.cal.com/api/auth/oauth/refreshToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })

  if (!res.ok) {
    // Carry Cal.com's own words through: without them this surfaces as an
    // empty event-type list, which reads as "you have no event types".
    const detail = await res.text().catch(() => '')
    console.error(`[cal-com] token refresh failed (${res.status}): ${detail.slice(0, 400)}`)
    // invalid_grant means the refresh token itself is dead — no amount of
    // retrying fixes it, the user has to reconnect. Callers use this to clear
    // the stored tokens so the UI stops claiming Cal.com is connected.
    const invalidGrant = detail.includes('invalid_grant') || detail.includes('invalid_refresh_token')
    throw new CalTokenError(
      `Cal.com token refresh failed (${res.status}): ${detail.slice(0, 200)}`,
      invalidGrant,
    )
  }

  return await res.json() as CalTokens
}

/**
 * Read a user's Cal.com access token, refreshing it if it's within 5 minutes of
 * expiry, and clearing the stored credentials if the refresh token is dead.
 *
 * Consolidates what was three near-identical copies (get-slots, create-booking,
 * cancel-booking). They had already drifted: two read `users`, the third read a
 * table called `integrations` that does not exist in this database.
 *
 * Returns null when the user has no Cal.com connection — callers should treat
 * that as "not connected" rather than an error.
 */
export async function getCalAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: u } = await supabase
    .from('users')
    .select('cal_com_access_token, cal_com_refresh_token, cal_com_token_expires_at')
    .eq('id', userId)
    .maybeSingle()

  if (!u?.cal_com_access_token) return null

  const expiry = new Date(u.cal_com_token_expires_at || 0).getTime()
  if (expiry - Date.now() > 5 * 60 * 1000) return u.cal_com_access_token
  if (!u.cal_com_refresh_token) return u.cal_com_access_token

  try {
    const tokens = await refreshCalToken(u.cal_com_refresh_token)
    await supabase.from('users').update({
      cal_com_access_token: tokens.access_token,
      cal_com_refresh_token: tokens.refresh_token || u.cal_com_refresh_token,
      cal_com_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', userId)
    return tokens.access_token
  } catch (e) {
    if (e instanceof CalTokenError && e.invalidGrant) {
      // Dead refresh token — stop presenting the integration as connected.
      console.warn(`[cal-com] refresh token rejected for user ${userId} — clearing stored credentials`)
      await supabase.from('users').update({
        cal_com_access_token: null,
        cal_com_refresh_token: null,
        cal_com_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)
    }
    throw e
  }
}
