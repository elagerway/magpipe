// Build the public `media` array for a message from its stored metadata.
//
// Inbound attachments live in the private `whatsapp-media` bucket; the message
// records the durable storage `path` plus a signed `url` that expires (~7d). For
// the public API/MCP we re-sign from `path` so the URL works even for old
// messages (mirrors sign-inbox-media), and strip `path` (internal). Callers must
// pass a SERVICE-ROLE client and rows already scoped to the caller's user.
const BUCKET = "whatsapp-media";
const TTL_SECONDS = 60 * 60 * 24; // 24h — ample for a consumer to fetch / backfill

export interface PublicMedia {
  url: string;
  mime_type: string | null;
  kind: "photo" | "audio" | "video" | "file";
  caption: string | null;
}

function kindOf(mime: string | null): PublicMedia["kind"] {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export async function signRowMedia(service: any, metadata: unknown): Promise<PublicMedia[]> {
  const items = (metadata as { media?: unknown[] } | null | undefined)?.media;
  if (!Array.isArray(items) || !items.length) return [];
  const out: PublicMedia[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const mime = (item?.mime_type as string) ?? null;
    let url = (item?.url as string) ?? null;
    if (item?.path) {
      const { data } = await service.storage
        .from(BUCKET)
        .createSignedUrl(item.path as string, TTL_SECONDS);
      if (data?.signedUrl) url = data.signedUrl;
    }
    if (url) out.push({ url, mime_type: mime, kind: kindOf(mime), caption: (item?.caption as string) ?? null });
  }
  return out;
}
