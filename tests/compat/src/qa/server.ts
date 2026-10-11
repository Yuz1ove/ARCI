import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { failure } from './contracts.js';
import { LocalStore, LocalError, parseBoundedJson, markdownExport } from './local-store.js';
import { LIMITS, routeStatus, behaviorCases } from './local-contracts.js';
import { z } from 'zod';
const root = resolve(import.meta.dirname, '../..');
const dataIndex=process.argv.indexOf('--data-dir');
if(dataIndex>=0&&!process.argv[dataIndex+1])throw new Error('DATA_PATH_REQUIRED');
const state = resolve(dataIndex>=0?process.argv[dataIndex+1]!:resolve(root,'.qa-runtime'));
mkdirSync(state, { recursive: true, mode: 0o700 });
const runtimeFile = resolve(state, 'runtime.json');
// Prevent concurrent launch/ledger races; stale lock requires explicit review, never automatic removal.
const lock = resolve(state, 'server.lock');
const sessions = new Map<string, { expires: number; active?: AbortController }>();
const shutdownToken = randomUUID();
let origin = '';
const store = new LocalStore(resolve(state, 'workbench.json'));
// Deliberately no environment/config switch can reactivate transport in delivery 08.
try { writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
catch { console.error('QA_ALREADY_LOCKED：請使用同工作區 STOP.command 停止既有服務；不會刪除不明 lock 或停止其他程序。'); process.exit(1); }
function json(res: ServerResponse, status: number, value: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length; if (size > LIMITS.bodyBytes) throw new LocalError('BODY_LIMIT'); chunks.push(bytes); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  return parseBoundedJson(text);
}
const server = createServer((req, res) => { void handle(req, res).catch((error: unknown) => { if (!res.headersSent) json(res, error instanceof LocalError && error.code === 'REVISION_CONFLICT' ? 409 : 400, { error: error instanceof LocalError ? error.code : 'INVALID_HTTP_INPUT' }); else res.end(); }); });
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(origin).host) { json(res, 403, { error: 'LOCAL_ONLY' }); return; }
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname === '/api/shutdown' && req.method === 'POST') {
    const token = req.headers['x-arci-shutdown'];
    if (typeof token !== 'string' || token.length !== shutdownToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(shutdownToken))) { json(res, 403, { error: 'DENIED' }); return; }
    json(res, 200, { stopped: true }); shutdown(); return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.headers.origin !== origin || req.headers['x-arci-qa'] !== '1') { json(res, 403, { error: 'ORIGIN_REQUIRED' }); return; }
    if (url.pathname === '/api/qa/session' && req.method === 'POST') {
      for (const [id, s] of sessions) if (s.expires < Date.now()) { s.active?.abort(); store.forget(id); sessions.delete(id); }
      if (sessions.size >= 32) { json(res, 429, { error: 'SESSION_LIMIT' }); return; }
      const id = randomUUID(); sessions.set(id, { expires: Date.now() + 3600000 }); json(res, 200, { session_id: id }); return;
    }
    const input = await body(req);
    const record = input as Record<string, unknown> | null;
    const id = typeof record?.session_id === 'string' ? record.session_id : '';
    const session = sessions.get(id);
    if (!session || session.expires < Date.now()) { session?.active?.abort(); store.forget(id); sessions.delete(id); json(res, 401, failure(typeof record?.request_id === 'string' ? record.request_id : 'invalid-request', 'SESSION_REQUIRED', '本機問答工作階段已失效，請重新整理。')); return; }
    if (url.pathname === '/api/qa/session' && req.method === 'DELETE') { session.active?.abort(); store.forget(id); sessions.delete(id); json(res, 200, { deleted: true, provider_deletion: 'UNKNOWN' }); return; }
    if (url.pathname === '/api/qa/stop' && req.method === 'POST') { session.active?.abort(); json(res, 200, { stopped: true, provider_stop: 'UNKNOWN' }); return; }
    if (url.pathname === '/api/local/view' && req.method === 'POST') { json(res, 200, { state: store.view(), headroom: store.headroom(), route: routeStatus, cases: behaviorCases }); return; }
    if (url.pathname === '/api/local/command' && req.method === 'POST') {
      const data = z.object({ session_id: z.string().uuid(), command: z.unknown() }).strict().parse(input);
      json(res, 200, store.command(data.command, id)); return;
    }
    if (url.pathname === '/api/local/export' && req.method === 'POST') {
      const data = z.object({ session_id: z.string().uuid(), topic: z.enum(['disaster', 'planning']), id: z.string().uuid(), format: z.enum(['json', 'md']) }).strict().parse(input);
      const result = store.view().records.find(r => r.id === data.id && r.topic === data.topic);
      if (!result) { json(res, 404, { error: 'RECORD_NOT_FOUND' }); return; }
      json(res, 200, { content: data.format === 'md' ? markdownExport(result) : JSON.stringify(result, null, 2) }); return;
    }
    if (url.pathname === '/api/qa/answer' && req.method === 'POST') {
      json(res, 422, failure(typeof record?.request_id === 'string' ? record.request_id : 'invalid-request', 'PROVIDER_ROUTE_DISABLED', routeStatus.message)); return;
    }
    if (url.pathname !== '/api/qa/answer' || req.method !== 'POST') { json(res, 404, { error: 'NOT_FOUND' }); return; }

  }
  if (req.method !== 'GET') { json(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return; }
  const assetRoot = resolve(root, 'dist/dashboard');
  const path = resolve(assetRoot, '.' + (url.pathname === '/' ? '/dashboard.html' : decodeURIComponent(url.pathname)));
  if (!path.startsWith(assetRoot + sep) || !existsSync(path)) { json(res, 404, { error: 'NOT_FOUND' }); return; }
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
  res.end(readFileSync(path));
}
function shutdown(): void {
  for (const s of sessions.values()) s.active?.abort();
  sessions.clear();
  server.close(() => { for (const file of [runtimeFile, lock]) if (existsSync(file)) unlinkSync(file); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
server.on('error', () => { if (existsSync(lock)) unlinkSync(lock); console.error('QA_START_FAILED'); process.exit(1); });
server.listen(0, '127.0.0.1', () => {
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('LISTEN_FAILED');
  origin = `http://127.0.0.1:${address.port}`;
  writeFileSync(runtimeFile, JSON.stringify({ url: origin, shutdownToken }), { mode: 0o600 });
  console.log(`ARCI-CORE-WORKBENCH-01 ${origin}/dashboard.html\n停止：此終端 Ctrl-C，或在同工作區執行 ./STOP.command。模型路線已停用。`);
});
