const BASE_URL = 'https://apiv3.creatordb.app';

export interface ApiResponse {
  data: unknown;
  creditsUsed: number;
  creditsAvailable: number;
  traceId: string;
  timestamp: number;
  errorCode: string;
  errorDescription: string;
  // V3 error envelopes also carry these — populated only on !success responses:
  error?: string;
  message?: string;
  details?: unknown;
  success: boolean;
}

async function doFetch(
  apiKey: string,
  path: string,
  options: {
    method: 'GET' | 'POST';
    params?: Record<string, string>;
    body?: unknown;
  },
): Promise<Response> {
  const url = new URL(path, BASE_URL);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  return fetch(url, {
    method: options.method,
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

export async function callApi(
  apiKey: string,
  path: string,
  options: {
    method: 'GET' | 'POST';
    params?: Record<string, string>;
    body?: unknown;
  },
): Promise<ApiResponse> {
  const res = await doFetch(apiKey, path, options);
  return res.json() as Promise<ApiResponse>;
}

/**
 * Call an SSE endpoint and collect all `data:` lines, returning the last
 * one that parses as JSON (the final result event).
 */
export async function callSseApi(
  apiKey: string,
  path: string,
  options: {
    method: 'GET' | 'POST';
    params?: Record<string, string>;
    body?: unknown;
  },
): Promise<ApiResponse> {
  const res = await doFetch(apiKey, path, options);
  const text = await res.text();

  // Parse SSE: collect all `data: {...}` lines, keep the last valid JSON object
  let lastParsed: ApiResponse | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload) continue;
    try {
      lastParsed = JSON.parse(payload) as ApiResponse;
    } catch {
      // skip non-JSON data lines (progress events, etc.)
    }
  }

  if (lastParsed) return lastParsed;

  // Fallback: try parsing the entire body as JSON
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return {
      data: { raw: text },
      creditsUsed: 0,
      creditsAvailable: 0,
      traceId: '',
      timestamp: Date.now(),
      errorCode: 'SSE_PARSE_ERROR',
      errorDescription: 'Could not parse SSE response',
      success: false,
    };
  }
}
