// Copied to an independent consumer by check-consumer.mjs before execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
let attempts = 0, moduleLoads = 0, loaderReadDepth = 0;
const block = () => {attempts++; throw new Error('IMPORT_SIDE_EFFECT');};
globalThis.fetch = block;
globalThis.WebSocket = class {constructor(){block();}};
for (const [module, methods] of [
  [fs,['readFileSync','readFile','openSync','open','writeFileSync','writeFile','mkdirSync','mkdir','readdirSync','readdir','statSync','stat']],
  [http,['request','get','createServer']], [https,['request','get','createServer']],
  [net,['connect','createConnection','createServer']], [dns,['lookup','resolve']],
  [childProcess,['spawn','exec','execFile','fork','spawnSync','execSync']],
]) for(const method of methods) {
  const original = module[method];
  module[method] = function(...args) {
    // Reading module bytes is the loader's job, not an application I/O side effect.
    const caller = new Error().stack?.split('\n')[2] ?? '';
    if (module === fs && ['readFileSync','readFile'].includes(method)
      && /^\s*at getSource(?:Sync)? \(node:internal\/modules\/esm\/load:/.test(caller)) {
      moduleLoads++; loaderReadDepth++;
      try { return original.apply(this,args); } finally { loaderReadDepth--; }
    }
    if (module === fs && method === 'openSync' && loaderReadDepth > 0 && args[1] === 'r') return original.apply(this,args);
    return block();
  };
}
for (const key of ['readFile','open','writeFile','mkdir','readdir','stat']) fs.promises[key] = block;
globalThis.setTimeout = block; globalThis.setInterval = block;
syncBuiltinESMExports();
assert.throws(() => fs.readFileSync('forbidden'), /IMPORT_SIDE_EFFECT/);
assert.throws(() => http.request('http://127.0.0.1'), /IMPORT_SIDE_EFFECT/);
assert.equal(attempts, 2); attempts = 0;
const core = await import('@arci/core');
const contracts = await import('@arci/core/contracts');
const adapter = await import('@arci/core/adapters/file-store');
assert.equal(typeof core.evaluate,'function');
assert.equal(typeof contracts.inputSchema.parse,'function');
assert.equal(typeof adapter.DecisionRepository,'function');
assert.equal(attempts,0);
console.log(JSON.stringify({imports:3,ioAttempts:attempts,moduleLoads,negativeControls:2}));
