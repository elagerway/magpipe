/**
 * Shared Slack channel utilities
 * Handles paginated fetching of channels from Slack API
 */

export interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members?: number
}

/**
 * Fetch ALL Slack channels using cursor-based pagination.
 * Slack's conversations.list returns max 1000 per page.
 */
export async function fetchAllSlackChannels(
  accessToken: string,
  types = 'public_channel,private_channel',
  excludeArchived = true,
): Promise<SlackChannel[]> {
  const allChannels: SlackChannel[] = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      types,
      exclude_archived: String(excludeArchived),
      limit: '1000',
    })
    if (cursor) params.set('cursor', cursor)

    const resp = await fetch(
      `https://slack.com/api/conversations.list?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const result = await resp.json()

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`)
    }

    for (const c of result.channels || []) {
      allChannels.push({
        id: c.id,
        name: c.name,
        is_private: c.is_private,
        num_members: c.num_members,
      })
    }

    cursor = result.response_metadata?.next_cursor || undefined
  } while (cursor)

  return allChannels
}

/**
 * Resolve a Slack channel name (e.g. "#general" or "general") to its ID.
 * Uses paginated fetch so it finds the channel even in large workspaces.
 */
export async function resolveSlackChannelId(
  accessToken: string,
  channelName: string,
  types = 'public_channel,private_channel',
): Promise<string | null> {
  const name = channelName.replace(/^#/, '').toLowerCase()
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      types,
      exclude_archived: 'true',
      limit: '1000',
    })
    if (cursor) params.set('cursor', cursor)

    const resp = await fetch(
      `https://slack.com/api/conversations.list?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const result = await resp.json()

    if (!result.ok) return null

    const match = (result.channels || []).find(
      (c: any) => c.name.toLowerCase() === name,
    )
    if (match) return match.id

    cursor = result.response_metadata?.next_cursor || undefined
  } while (cursor)

  return null
}
