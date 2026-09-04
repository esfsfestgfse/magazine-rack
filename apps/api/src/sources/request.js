export class SourceError extends Error {
  constructor(source, code, status = 502) {
    super(code);
    this.name = 'SourceError';
    this.source = source;
    this.code = code;
    this.status = status;
  }
}

async function readJson(response, source, maxBytes) {
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > maxBytes) throw new SourceError(source, 'response_too_large');
  if (!response.body) throw new SourceError(source, 'empty_response');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SourceError(source, 'response_too_large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SourceError(source, 'invalid_json');
  }
}

export async function fetchJson(url, env, source, options = {}) {
  const response = await fetchResponse(url, env, source, 'application/json', options);
  return readJson(response, source, options.maxBytes || 1_500_000);
}

export async function fetchText(url, env, source, options = {}) {
  const response = await fetchResponse(url, env, source, 'text/html,application/xhtml+xml', options);
  const length = Number(response.headers.get('Content-Length'));
  const maxBytes = options.maxBytes || 2_500_000;
  if (Number.isFinite(length) && length > maxBytes) throw new SourceError(source, 'response_too_large');
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new SourceError(source, 'response_too_large');
  return text;
}

const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 2_000;

function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(response, attempt) {
  const seconds = Number(response?.headers?.get('Retry-After'));
  if (Number.isFinite(seconds)) return Math.max(100, Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000));
  return Math.min(MAX_RETRY_DELAY_MS, 250 * (2 ** Math.max(0, attempt - 1)));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchResponse(url, env, source, accept, options = {}) {
  const attempts = Math.max(1, Math.min(MAX_ATTEMPTS, Number(options.retries ?? MAX_ATTEMPTS - 1) + 1));
  let lastError = new SourceError(source, 'unreachable');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 8_000);
    let response;
    try {
      try {
        response = await fetch(url, {
          headers: { Accept: accept, 'User-Agent': env.CATALOG_USER_AGENT || 'MagazineRack/1.0 public catalog client', ...(options.headers || {}) },
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (error) {
        lastError = new SourceError(source, error?.name === 'AbortError' ? 'timeout' : 'unreachable', error?.name === 'AbortError' ? 408 : 502);
      }
      if (response) {
        if (response.status >= 300 && response.status < 400) throw new SourceError(source, 'redirect_rejected');
        if (response.ok) return response;
        lastError = new SourceError(source, `upstream_${response.status}`, response.status >= 500 ? 502 : response.status);
        if (!transientStatus(response.status)) throw lastError;
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await wait(retryDelay(response, attempt));
  }
  throw lastError;
}

export function sourceFailure(error) {
  return error instanceof SourceError ? { code: error.code, status: error.status } : { code: 'unavailable', status: 502 };
}
