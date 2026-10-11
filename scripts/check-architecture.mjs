import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
export function importsIn(code, file) {
  const imports = [], forbidden = [];
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      assert(ts.isStringLiteral(node.moduleSpecifier)); imports.push(node.moduleSpecifier.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0];
      imports.push(arg && ts.isStringLiteral(arg) ? arg.text : '<dynamic>');
    }
    if (ts.isIdentifier(node) && ['fetch','XMLHttpRequest','WebSocket','eval','Function','process','Buffer','Deno','Bun'].includes(node.text)) forbidden.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast); return {imports, forbidden};
}
function walk(entry, {source = false, persistence = false} = {}) {
  const seen = new Set(), externals = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const own = !file.includes(`${sep}node_modules${sep}`);
    const text = readFileSync(file, 'utf8');
    const info = importsIn(text, file);
    if (own && !persistence) assert.deepEqual(info.forbidden, [], `Pure entry capability in ${relative(root,file)}`);
    for (const spec of info.imports) {
      assert.notEqual(spec, '<dynamic>', `Unresolved dynamic dependency in ${file}`);
      if (spec.startsWith('.')) {
        const next = resolve(dirname(file), source && own ? spec.replace(/\.js$/, '.ts') : spec);
        assert(next.startsWith(own ? resolve(root,'src')+sep : resolve(root,'node_modules/zod')+sep) || (!source && next.startsWith(resolve(root,'dist')+sep)), `Dependency escaped: ${spec}`);
        visit(next);
      } else if (spec === 'zod') {
        externals.add(spec);
        // Traverse the actual installed dependency as well as our own imports.
        visit(fileURLToPath(import.meta.resolve('zod')));
      } else {
        assert(persistence && ['node:fs','node:path','node:crypto'].includes(spec), `Forbidden dependency: ${spec}`);
        externals.add(spec);
      }
    }
  }
  visit(entry); return {modules: seen.size, dependencies: [...externals].sort()};
}
export function checkArchitecture() {
  assert.deepEqual(importsIn('export * from "../app.js"; import(name); fetch("url");','negative.ts'), {imports:['../app.js','<dynamic>'],forbidden:['fetch']});
  const packageJson = JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
  assert.deepEqual(Object.keys(packageJson.dependencies),['zod']);
  const output = {
    sourceCore: walk(resolve(root,'src/index.ts'),{source:true}),
    builtCore: walk(resolve(root,'dist/index.js')),
    builtContracts: walk(resolve(root,'dist/contracts.js')),
    optionalFileStore: walk(resolve(root,'dist/adapters/file-store.js'),{persistence:true}),
  };
  for(const file of readdirSync(resolve(root,'examples/adapters'))) {
    const {imports} = importsIn(readFileSync(resolve(root,'examples/adapters',file),'utf8'), file);
    assert(imports.every(spec => spec === '@arci/core'), 'Example adapters must use only public API');
  }
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(checkArchitecture(),null,2));
