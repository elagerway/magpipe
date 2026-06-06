/**
 * Inbound WhatsApp media → durable, customer-fetchable URL.
 *
 * WhatsApp-specific part: resolve a media id to Meta's short-lived download URL.
 * The download→re-host→sign is delegated to the shared `rehostInboundMedia`
 * (also used by the SMS/MMS path) so the storage/TTL/MIME logic lives in one place.
 */

import { rehostInboundMedia } from '../_shared/inbound-media.ts'

export interface ForwardedMedia {
  url: string
  mime_type: string
  caption: string | null
  // Durable storage path (re-signable for inbox display after `url` expires);
  // stripped from the customer-facing forward payload.
  path: string
}

/**
 * Download a WhatsApp media object from Meta and re-host it. Returns a signed URL
 * + durable path for the forward / report tool / inbox, or null on any failure
 * (never throws — media loss must not break the inbound flow).
 */
export async function fetchAndStoreWhatsAppMedia(
  supabase: any,
  accessToken: string,
  mediaId: string,
  caption: string | null,
  ctx: { phoneNumberId: string },
): Promise<ForwardedMedia | null> {
  try {
    // Resolve the media id to Meta's temporary, token-gated download URL.
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) {
      console.error('WA media: metadata fetch failed:', await metaRes.text())
      return null
    }
    const meta = await metaRes.json()
    if (!meta.url) {
      console.error('WA media: no url in metadata response')
      return null
    }

    const stored = await rehostInboundMedia(supabase, {
      downloadUrl: meta.url,
      authHeader: `Bearer ${accessToken}`,
      bucket: 'whatsapp-media',
      pathPrefix: `inbound/${ctx.phoneNumberId}/${mediaId}`,
      mimeFallback: meta.mime_type,
    })
    if (!stored) return null

    return { url: stored.url, mime_type: stored.mime_type, caption: caption || null, path: stored.path }
  } catch (e) {
    console.error('WA media: unexpected error:', e)
    return null
  }
}
