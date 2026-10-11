import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
function list(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(resolve(dir,e.name)):e.name.endsWith('.md')?[resolve(dir,e.name)]:[]);}
const files=[resolve(root,'README.md'),resolve(root,'THIRD_PARTY_NOTICES.md'),...list(resolve(root,'docs'))];
let links=0;
for(const file of files){
 const markdown=readFileSync(file,'utf8');
 for(const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
  const link=match[1];if(/^(https?:|mailto:|#)/.test(link))continue;
  assert(existsSync(resolve(dirname(file),decodeURIComponent(link.split('#')[0]))),`Broken link ${file}: ${link}`);links++;
 }
}
const readme=readFileSync(resolve(root,'README.md'),'utf8');
const snippet=readme.match(/<!-- executable:minimal -->\s*```js\n([\s\S]*?)```/)[1];
assert.equal(snippet,readFileSync(resolve(root,'examples/minimal.mjs'),'utf8'));
const output=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',snippet],{cwd:root,encoding:'utf8'}));
assert.equal(output.status,'PASS');assert.equal(output.executionStatus,'NOT_DISPATCHED');
const scripts=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts;
for(const [,command] of readme.matchAll(/npm run ([\w:-]+)/g)) assert(Object.hasOwn(scripts,command),`Unknown README script ${command}`);
console.log(JSON.stringify({markdownFiles:files.length,relativeLinks:links,executableReadmeSnippet:true,readmeScriptsExist:true},null,2));
