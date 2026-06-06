/**
 * Re-host an authenticated inbound media URL into Supabase Storage and return a
 * time-limited signed URL.
 *
 * Both carriers hand us media URLs that require *our* credentials to download
 * (Meta needs a Bearer token; SignalWire needs Basic auth), so an external
 * webhook consumer can't fetch them directly. We copy the bytes into a private
 * bucket and forward a signed URL the consumer can GET without any Magpipe
 * credentials.
 *
 * Never throws — media loss must not break the inbound message flow.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days — enough for a webhook consumer to fetch promptly. The durable `path` is persisted so the inbox re-signs on demand (sign-inbox-media) once this expires, rather than relying on a near-permanent link.

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface StoredMedia {
  url: string
  mime_type: string
  path: string
}

export async function rehostInboundMedia(
  supabase: any,
  opts: {
    downloadUrl: string
    authHeader: string
    bucket: string
    /** Path without extension; the resolved extension is appended. */
    pathPrefix: string
    mimeFallback?: string
  },
): Promise<StoredMedia | null> {
  try {
    const res = await fetch(opts.downloadUrl, { headers: { Authorization: opts.authHeader } })
    if (!res.ok) {
      console.error('rehostInboundMedia: download failed', res.status)
      return null
    }
    const mimeType = (res.headers.get('content-type') || opts.mimeFallback || 'application/octet-stream')
      .split(';')[0].trim()
    const blob = await res.blob()

    const ext = MIME_EXT[mimeType] || 'bin'
    const path = `${opts.pathPrefix}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(opts.bucket)
      .upload(path, blob, { contentType: mimeType, upsert: true })
    if (uploadError) {
      console.error('rehostInboundMedia: upload failed', uploadError.message)
      return null
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(opts.bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (signError || !signed?.signedUrl) {
      console.error('rehostInboundMedia: sign failed', signError?.message)
      return null
    }

    return { url: signed.signedUrl, mime_type: mimeType, path }
  } catch (e) {
    console.error('rehostInboundMedia: unexpected error', e)
    return null
  }
}
