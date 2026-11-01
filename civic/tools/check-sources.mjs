import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function sourceText(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw new Error('No main content found; extraction requires review');
  const text = main.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
  if (text.length < 200) throw new Error('Source main content is unexpectedly short');
  return text;
}

export async function checkSource(source, fetcher = fetch, checkedAt = new Date().toISOString()) {
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'www.admin.ch') throw new Error('Unregistered source host');
    const response = await fetcher(source.url, {
      redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'errandom-Civic-source-monitor/0.1 (+https://www.errandom.com/civic/)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Unexpected document type');
    const html = await response.text();
    if (html.length > 3000000) throw new Error('Document exceeds monitoring size limit');
    const text = sourceText(html);
    if (!text.includes(source.expectedText)) throw new Error('Source identity could not be verified');
    return { id: source.id, url: source.url, checkedAt, state: 'available',
      hash: createHash('sha256').update(text).digest('hex'), text };
  } catch (error) {
    console.error(JSON.stringify({ event: 'source_check_failed', id: source.id, error: error.message }));
    return { id: source.id, url: source.url, checkedAt, state: 'unavailable', error: error.message, hash: null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sources = JSON.parse(readFileSync(new URL('../sources.json', import.meta.url), 'utf8'));
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(sources.map(source => checkSource(source, fetch, checkedAt)));
  const report = { checkedAt, results: results.map(({ text, ...result }) => result) };
  writeFileSync(new URL('../source-status.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checkedAt, unavailable: results.filter(result => result.state !== 'available').length }));
}
