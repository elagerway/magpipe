/**
 * SignalWire Number Lookup (LRN/LERG-backed) + a Postgres cache.
 *
 * Extracted from lookup-phone-number so the notification path can reuse the
 * exact same request and parsing. SignalWire bills per lookup, so every caller
 * here goes through `lookupWithCache` — a number is charged once per TTL,
 * regardless of how many calls or channels it appears in.
 */

export interface PhoneLookup {
  e164: string;
  national_format: string | null;
  country: string | null;
  location: string | null;
  /**
   * The LERG/LRN record. `name`/`type` duplicate `lec`/`linetype` for the
   * Phone → Lookup page, which predates the richer fields.
   */
  carrier: {
    name: string | null;
    type: string | null;
    city: string | null;
    state: string | null;
    lec: string | null;
    linetype: string | null;
    ocn: string | null;
    lrn: string | null;
    lata: string | null;
    spid: string | null;
    jurisdiction: string | null;
    dnc: unknown;
  } | null;
  line_type: string | null;
  cnam: string | null;
  /** Every field SignalWire returned under `cnam`, not just caller_id. */
  cnam_raw: Record<string, unknown> | null;
  error?: string;
}

/**
 * The includes MUST be one comma-separated `include=carrier,cnam` parameter.
 * Repeating the parameter (`?include=carrier&include=cnam`) returns 200 with
 * the carrier block silently missing — which is why this account looked like it
 * didn't return LERG data at all. `/api/lookup/v1/` 404s on this space, so the
 * relay/rest path is tried first and v1 is kept only as a fallback.
 */
export async function signalwireLookup(e164: string): Promise<{ data?: any; error?: string }> {
  const space = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN');
  if (!projectId || !apiToken) return { error: 'SignalWire credentials not configured' };

  const auth = 'Basic ' + btoa(`${projectId}:${apiToken}`);
  const endpoints = [
    `https://${space}/api/relay/rest/lookup/phone_number/${encodeURIComponent(e164)}?include=carrier,cnam`,
    `https://${space}/api/lookup/v1/${encodeURIComponent(e164)}?include=carrier,cnam,lineType`,
  ];

  let lastError = '';
  for (const url of endpoints) {
    // One retry on a transient failure. A burst of concurrent lookups (a
    // blocklist backfill, a spam wave) gets rate-limited by SignalWire, and
    // without this the enrichment is silently dropped — the numbers land on
    // the fraud list with no carrier data at all.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 600 + Math.floor(Math.random() * 400)));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(url, {
          headers: { Authorization: auth, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (resp.ok) return { data: await resp.json() };

        const text = await resp.text().catch(() => '');
        lastError = `SignalWire returned ${resp.status}${text ? `: ${text.slice(0, 160)}` : ''}`;
        // 404 → wrong endpoint shape for this space, try the next URL.
        if (resp.status === 404) break;
        // 429/5xx → worth retrying. Anything else is a real answer.
        if (resp.status !== 429 && resp.status < 500) return { error: lastError };
      } catch (e) {
        lastError = (e as Error).name === 'AbortError' ? 'SignalWire lookup timed out' : String((e as Error).message || e);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  return { error: lastError || 'SignalWire lookup failed' };
}

/**
 * Normalize a raw SignalWire response. A real one from this space:
 *   { e164, country_code: "CA", location: "British Columbia",
 *     national_number_formatted, number_type: "Fixed Line or Mobile",
 *     carrier: { lrn, spid, ocn, lata, city: "Vancouver", state: "BC",
 *                jurisdiction, lec: "Iristel Inc.", linetype: "landline", dnc },
 *     cnam: { caller_id: "VANCOUVER    BC" } }
 * Field names vary across accounts (name|lec, type|linetype), hence the
 * fallbacks. CNAM arrives space-padded, so it's squeezed here.
 */
export function parseLookup(e164: string, swData: any): PhoneLookup {
  const d = swData || {};
  const c = d.carrier || {};
  const lec = c.lec ?? c.name ?? null;
  const linetype = c.linetype ?? c.type ?? null;
  const hasCarrier = Object.keys(c).length > 0;
  const cnamRaw = d.cnam && typeof d.cnam === 'object' ? d.cnam : null;
  const cnamId = cnamRaw?.caller_id ?? cnamRaw?.name ?? null;
  return {
    e164,
    national_format: d.national_number_formatted ?? d.national_number_format ?? null,
    country: d.country_code ?? d.country ?? null,
    location: d.location ?? null,
    carrier: hasCarrier
      ? {
          name: lec,
          type: linetype,
          city: c.city ?? null,
          state: c.state ?? null,
          lec,
          linetype,
          ocn: c.ocn ?? null,
          lrn: c.lrn ?? null,
          lata: c.lata ?? null,
          spid: c.spid ?? null,
          jurisdiction: c.jurisdiction ?? null,
          dnc: c.dnc ?? null,
        }
      : null,
    line_type: linetype ?? d.number_type ?? d.line_type?.line_type ?? null,
    cnam: typeof cnamId === 'string' ? cnamId.replace(/\s+/g, ' ').trim() : null,
    cnam_raw: cnamRaw,
  };
}

/**
 * Notification rendering. Deliberately limited to City, State/Prov, Line type,
 * LEC/CLEC and every CNAM field — the rest of the LERG record (LRN, OCN, LATA,
 * SPID, jurisdiction) is stored in the cache and returned by the Lookup page,
 * but is noise in an alert. Fields SignalWire didn't return are omitted rather
 * than printed empty.
 */
export function formatLookupLine(lookup: PhoneLookup | null): string {
  const head = 'Caller lookup (not in contacts):';
  if (!lookup) return `${head}\nunavailable`;

  const c = lookup.carrier;
  const lines: string[] = [];
  if (c?.city) lines.push(`City: ${c.city}`);
  // The carrier record's state is the LERG one; `location` is SignalWire's
  // own region string and is the only source for numbers with no carrier data.
  const state = c?.state || lookup.location || null;
  if (state) lines.push(`State/Prov: ${state}`);
  if (lookup.line_type) lines.push(`Line type: ${lookup.line_type}`);
  if (c?.lec) lines.push(`LEC/CLEC: ${c.lec}`);

  // All CNAM info: usually just caller_id, but render whatever came back.
  const cnamRaw = lookup.cnam_raw || (lookup.cnam ? { caller_id: lookup.cnam } : null);
  if (cnamRaw) {
    const entries = Object.entries(cnamRaw)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => [k, String(v).replace(/\s+/g, ' ').trim()] as const);
    if (entries.length === 1 && entries[0][0] === 'caller_id') {
      lines.push(`CNAM: ${entries[0][1]}`);
    } else {
      for (const [k, v] of entries) lines.push(`CNAM ${k.replace(/_/g, ' ')}: ${v}`);
    }
  }

  if (lines.length === 0) return `${head}\nno details returned${lookup.error ? ` (${lookup.error})` : ''}`;
  return `${head}\n${lines.join('\n')}`;
}

const CACHE_TABLE = 'phone_lookup_cache';

/**
 * Cached lookup. A miss costs one billed SignalWire query; a hit inside the TTL
 * costs nothing. Failures are NOT cached — a transient SignalWire error
 * shouldn't poison the entry for a month.
 */
export async function lookupWithCache(
  supabase: any,
  e164: string,
  maxAgeDays = 30,
): Promise<PhoneLookup | null> {
  try {
    const { data: cached } = await supabase
      .from(CACHE_TABLE)
      .select('data, looked_up_at')
      .eq('e164', e164)
      .maybeSingle();

    if (cached?.data) {
      const ageMs = Date.now() - new Date(cached.looked_up_at).getTime();
      if (ageMs < maxAgeDays * 24 * 60 * 60 * 1000) return cached.data as PhoneLookup;
    }

    const sw = await signalwireLookup(e164);
    if (sw.error || !sw.data) {
      console.warn(`[phone-lookup] ${e164}: ${sw.error || 'no data'}`);
      // Serve a stale hit rather than nothing when SignalWire is down.
      return (cached?.data as PhoneLookup) ?? null;
    }

    const parsed = parseLookup(e164, sw.data);
    await supabase
      .from(CACHE_TABLE)
      .upsert({ e164, data: parsed, looked_up_at: new Date().toISOString() }, { onConflict: 'e164' });
    return parsed;
  } catch (e) {
    console.error('[phone-lookup] cache/lookup error:', e);
    return null;
  }
}
