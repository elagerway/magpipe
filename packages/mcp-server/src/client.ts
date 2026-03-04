const DEFAULT_API_URL = "https://api.magpipe.ai/functions/v1";

export class MagpipeClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, apiUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
  }

  async call<T = unknown>(
    endpoint: string,
    body: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      data = { raw: text };
    }

    if (!res.ok) {
      const errMsg =
        (data as Record<string, unknown>)?.error &&
        typeof (data as Record<string, unknown>).error === "object"
          ? ((data as Record<string, Record<string, string>>).error.message ??
            JSON.stringify((data as Record<string, unknown>).error))
          : typeof (data as Record<string, unknown>)?.error === "string"
            ? (data as Record<string, string>).error
            : text;
      throw new Error(`API error (${res.status}): ${errMsg}`);
    }

    return data as T;
  }
}
