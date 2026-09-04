import { errorJson, responseHeaders } from '../http.js';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function allowedComicBookPlusImage(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (!['comicbookplus.com', 'www.comicbookplus.com', 'box01.comicbookplus.com'].includes(url.hostname)) return null;
    if (!/^\/viewer\/[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)?\/(?:\d+|mediumthumb|largethumb)\.jpg$/i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function alternateComicBookPlusImage(url) {
  const alternate = new URL(url.toString());
  alternate.hostname = alternate.hostname === 'box01.comicbookplus.com' ? 'comicbookplus.com' : 'box01.comicbookplus.com';
  return alternate;
}

async function readBytes(response) {
  const contentLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
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
  return bytes;
}

export async function handleMedia(request, env, _ctx, requestId) {
  const url = new URL(request.url);
  if (url.searchParams.get('source') !== 'comicbookplus') return errorJson(request, env, 'invalid_media_source', 400, requestId);
  const target = allowedComicBookPlusImage(url.searchParams.get('url'));
  if (!target) return errorJson(request, env, 'invalid_media_url', 400, requestId);
  let response;
  try {
    response = await fetch(target, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://comicbookplus.com/',
        'User-Agent': env.CATALOG_USER_AGENT || 'MagazineRack/1.0 public catalog client',
      },
      redirect: 'manual',
    });
  } catch {
    return errorJson(request, env, 'media_upstream_unreachable', 502, requestId);
  }
  if (!response.ok && (response.status === 403 || response.status === 404)) {
    try {
      const alternate = await fetch(alternateComicBookPlusImage(target), {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: 'https://comicbookplus.com/',
          'User-Agent': env.CATALOG_USER_AGENT || 'MagazineRack/1.0 public catalog client',
        },
        redirect: 'manual',
      });
      if (alternate.ok) response = alternate;
    } catch { /* keep the original response for a stable error */ }
  }
  if (response.status >= 300 && response.status < 400) return errorJson(request, env, 'media_redirect_rejected', 502, requestId);
  if (!response.ok) return errorJson(request, env, `media_upstream_${response.status}`, response.status >= 500 ? 502 : 404, requestId);
  const contentType = response.headers.get('Content-Type') || '';
  if (!/^image\//i.test(contentType)) return errorJson(request, env, 'media_not_image', 502, requestId);
  const bytes = await readBytes(response);
  if (!bytes) return errorJson(request, env, 'media_too_large', 502, requestId);
  const headers = responseHeaders(request, env, requestId, 'public, max-age=86400, stale-while-revalidate=604800');
  headers.set('Content-Type', contentType.split(';', 1)[0] || 'image/jpeg');
  headers.set('Content-Length', String(bytes.byteLength));
  return new Response(bytes, { status: 200, headers });
}
