import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const consumer = realpathSync(mkdtempSync(join(tmpdir(),'arci-consumer-')));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = consumer) {
  return execFileSync(command,args,{cwd,encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_OPTIONS:'',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',DATABASE_URL:'',ARCI_DATA_DIR:''}});
}
let report;
try {
  const packed = JSON.parse(run(npm,['pack','--ignore-scripts','--json','--pack-destination',consumer],root))[0];
  for(const file of packed.files) assert(/^(dist\/|package.json$|README.md$|THIRD_PARTY_NOTICES.md$|docs\/.*\.(md|json)$|examples\/.*\.mjs$)/.test(file.path),`Unexpected package content: ${file.path}`);
  const pkg = JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  for (const entry of Object.values(pkg.exports)) for (const file of Object.values(entry)) {
    assert(packed.files.some(f=>f.path===file.slice(2)), `Missing public entry: ${file}`);
  }
  for (const file of ['docs/API.md','docs/LIMITATIONS.md','docs/PROVENANCE.md','docs/VALIDATION.md','examples/minimal.mjs']) {
    assert(packed.files.some(f=>f.path===file), `Missing package documentation/example: ${file}`);
  }
  writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'independent-arci-consumer',private:true,type:'module'}));
  run(npm,['install','--prefer-offline','--ignore-scripts','--no-audit','--no-fund',join(consumer,packed.filename)]);
  assert(!realpathSync(join(consumer,'node_modules/@arci/core')).startsWith(resolve(root)), 'Installed package must not link to source');
  cpSync(join(root,'examples'),join(consumer,'examples'),{recursive:true});
  cpSync(join(root,'scripts/import-probe.mjs'),join(consumer,'import-probe.mjs'));
  const importProbe = JSON.parse(run(process.execPath,['--permission',`--allow-fs-read=${consumer}`,'import-probe.mjs']));
  const minimal = JSON.parse(run(process.execPath,['examples/minimal.mjs']));
  assert.deepEqual(minimal,{status:'PASS',executionStatus:'NOT_DISPATCHED',completionStatus:'NOT_ESTABLISHED',ruleVersion:'1'});
  for (const file of ['inventory','release']) {
    const results = JSON.parse(run(process.execPath,[`examples/${file}.mjs`]));
    assert.deepEqual(results.map(r=>r.status),['PASS','FAIL','UNKNOWN']);
    assert(results.every(r=>r.executionStatus==='NOT_DISPATCHED'&&r.completionStatus==='NOT_ESTABLISHED'));
  }
  writeFileSync(join(consumer,'smoke.mts'), `import {evaluate, type DecisionInput, type Constraint, type SourceSnapshot, type RuleSet, replayEvaluation, type Evaluation} from '@arci/core';\nimport {inputSchema} from '@arci/core/contracts';\nimport {DecisionRepository} from '@arci/core/adapters/file-store';\nconst i: DecisionInput = inputSchema.parse({context:{},facts:{},parameters:{},selectedSources:[],requestedOperation:'EVALUATE'});\nexport const use = (s: SourceSnapshot, c: Constraint[], r: RuleSet, e: Evaluation) => [evaluate(i,s,c),r.version,replayEvaluation(e),DecisionRepository];\n`);
  // Compiler is test tooling; all consumer types resolve from the installed tarball.
  run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','smoke.mts']);
  writeFileSync(join(consumer,'deep-import.mjs'),`import assert from 'node:assert/strict';\nawait assert.rejects(import('@arci/core/dist/core/engine.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});\n`);
  run(process.execPath,['deep-import.mjs']);
  report = {package:packed.name,version:packed.version,files:packed.files.length,tarballIntegrity:packed.integrity,
    installedOutsideWorkspace:true,sourceSymlink:false,publicTypecheck:true,deepImportBlocked:true,importProbe,
    scenarios:{inventory:['PASS','FAIL','UNKNOWN'],release:['PASS','FAIL','UNKNOWN']}};
  console.log(JSON.stringify(report,null,2));
} finally { rmSync(consumer,{recursive:true,force:true}); }
