import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizedIssueFields, coverScore } from '../apps/api/src/sources/common.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = 'apps/api/wrangler.jsonc';
const database = 'margin-catalog';
const batchSize = 500;
const updateSize = 50;

function wranglerJson(sql) {
  const wranglerBin = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const result = spawnSync(process.execPath, [wranglerBin, 'd1', 'execute', database, '--remote', '--config', config, '--env', 'production', '--command', sql, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `Wrangler exited ${result.status}`);
  const start = result.stdout.indexOf('[');
  if (start < 0) throw new Error(`Wrangler returned no JSON: ${result.stdout.slice(-500)}`);
  return JSON.parse(result.stdout.slice(start));
}

function sqlText(value) {
  return "'" + String(value ?? '').replaceAll("'", "''") + "'";
}

function metadata(row) {
  try { return row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { return {}; }
}

function updatesFor(row) {
  const meta = metadata(row);
  const fields = normalizedIssueFields({ title: row.title, metadata: meta });
  const score = Number(row.cover_score) || (row.cover_url ? coverScore({ coverUrl: row.cover_url, coverQuality: row.cover_quality }) : 0);
  const updates = [];
  if (!row.series_title && fields.series) updates.push(`series_title=${sqlText(fields.series)}`);
  if (!row.issue_number && fields.issue) updates.push(`issue_number=${sqlText(fields.issue)}`);
  if (!row.volume_number && fields.volume) updates.push(`volume_number=${sqlText(fields.volume)}`);
  if (!(Number(row.cover_score) > 0) && score > 0) updates.push(`cover_score=${Math.trunc(score)}`);
  if (!row.access_checked_at && row.last_seen_at) updates.push(`access_checked_at=${sqlText(row.last_seen_at)}`);
  return updates.length ? `UPDATE catalog_items SET ${updates.join(', ')} WHERE id=${sqlText(row.id)};` : '';
}

let offset = 0;
let scanned = 0;
let changed = 0;
let updates = [];
while (true) {
  const result = wranglerJson(`SELECT id,title,metadata_json,cover_url,cover_quality,cover_score,series_title,issue_number,volume_number,access_checked_at,last_seen_at FROM catalog_items ORDER BY id LIMIT ${batchSize} OFFSET ${offset}`);
  const rows = result[0]?.results || [];
  if (!rows.length) break;
  scanned += rows.length;
  for (const row of rows) {
    const update = updatesFor(row);
    if (update) { updates.push(update); changed += 1; }
  }
  while (updates.length >= updateSize) {
    wranglerJson(updates.splice(0, updateSize).join('\n'));
    console.log(`rehydrated ${Math.min(scanned, offset + batchSize)} scanned / ${changed} changed`);
  }
  offset += rows.length;
  if (rows.length < batchSize) break;
}
if (updates.length) wranglerJson(updates.join('\n'));
console.log(JSON.stringify({ ok: true, scanned, changed }));
