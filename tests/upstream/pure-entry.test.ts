import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {sha256Text} from '../../src/core/hash.js';
import {createSnapshot,evaluate,known} from '../../src/index.js';
it.each(['','abc','中文🙂','x'.repeat(10000)])('matches standard SHA256 for utf8',text=>expect(sha256Text(text)).toBe(createHash('sha256').update(text).digest('hex')));
it('pure entry transitive imports have no Node or provider capability',()=>{const seen=new Set<string>();function visit(file:string){if(seen.has(file))return;seen.add(file);const text=readFileSync(file,'utf8');for(const [,specifier] of text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)){if(specifier!.startsWith('.'))visit(resolve(dirname(file),specifier!.replace(/\.js$/,'.ts')));else expect(specifier).toBe('zod');}expect(text).not.toMatch(/\b(?:Buffer|fetch|process)\b/);}visit(resolve('src/index.ts'));});
it('clock and id source are injectable without mutating input',()=>{const runtime={id:()=> 'fixed-id',now:()=> '2026-01-01T00:00:00.000Z'};const s=createSnapshot([],runtime);const r=evaluate({context:{},facts:{x:known(1)},selectedSources:[],parameters:{},requestedOperation:'EVALUATE'},s,[],runtime);expect(r.decisionId).toBe('fixed-id');expect(r.createdAt).toBe(runtime.now());});
