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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': env.CATALOG_USER_AGENT || 'MagazineRack/1.0 public catalog client', ...(options.headers || {}) }, redirect: 'manual', signal: controller.signal });
    } catch {
      throw new SourceError(source, 'unreachable');
    }
    if (response.status >= 300 && response.status < 400) throw new SourceError(source, 'redirect_rejected');
    if (!response.ok) throw new SourceError(source, `upstream_${response.status}`, response.status >= 500 ? 502 : response.status);
    return await readJson(response, source, options.maxBytes || 1_500_000);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, env, source, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': env.CATALOG_USER_AGENT || 'MagazineRack/1.0 public catalog client', ...(options.headers || {}) },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      throw new SourceError(source, 'unreachable');
    }
    if (response.status >= 300 && response.status < 400) throw new SourceError(source, 'redirect_rejected');
    if (!response.ok) throw new SourceError(source, `upstream_${response.status}`, response.status >= 500 ? 502 : response.status);
    const length = Number(response.headers.get('Content-Length'));
    const maxBytes = options.maxBytes || 2_500_000;
    if (Number.isFinite(length) && length > maxBytes) throw new SourceError(source, 'response_too_large');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new SourceError(source, 'response_too_large');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function sourceFailure(error) {
  return error instanceof SourceError ? { code: error.code, status: error.status } : { code: 'unavailable', status: 502 };
}
