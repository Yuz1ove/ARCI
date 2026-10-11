import { readFileSync,readdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import ts from 'typescript';
import { it,expect } from 'vitest';
const root=resolve('src/core');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.name.endsWith('.ts')?[join(dir,e.name)]:[]);}
const vocabulary=/starry|disaster|rescue|emergency|signal|network|base.?station|battery|channels|communication|satellite|mesh|connectivity|coverage|災害|救援|訊號|基地台|基地站|斷訊|避難|災情|通訊|救災|衛星|災區|活動規則|比賽容量|活動人數|截止日|participants|capacity|deadline|planning/i;
function inspect(code:string,path:string){const imports:string[]=[],words:string[]=[],capabilities:string[]=[];const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
 const visit=(node:ts.Node)=>{
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
  if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text);
  if(ts.isCallExpression(node)&&((node.expression.kind===ts.SyntaxKind.ImportKeyword)||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))) {const arg=node.arguments[0];imports.push(arg&&ts.isStringLiteral(arg)?arg.text:'DYNAMIC_IMPORT_FORBIDDEN');}
  if((ts.isIdentifier(node)||ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&vocabulary.test(node.text))words.push(node.text);
  if(ts.isIdentifier(node)&&['fetch','XMLHttpRequest','WebSocket','eval','Function'].includes(node.text))capabilities.push(node.text);
  ts.forEachChild(node,visit);
 };visit(ast);return {imports,words,capabilities};}
it('Core imports only Core, node crypto/fs/path and zod; no transitive adapter escape',()=>{
 const violations:string[]=[];
 for(const file of files(root)){const found=inspect(readFileSync(file,'utf8'),file);for(const spec of found.imports){if(spec.startsWith('.')){if(!resolve(file,'..',spec).startsWith(root+'/'))violations.push(file+':'+spec);}else if(!['zod','node:crypto','node:fs','node:path'].includes(spec))violations.push(file+':'+spec);}expect(found.capabilities).toEqual([]);}
 expect(violations).toEqual([]);
});
it('STARRYLINK_DOMAIN_REFERENCES_IN_CORE=0 in source types schemas exported symbols, ignoring comments',()=>{expect(files(root).flatMap(f=>inspect(readFileSync(f,'utf8'),f).words)).toEqual([]);});
it('architecture negative controls detect re-export, dynamic import, domain symbol, schema and string leaks',()=>{
 const bad=inspect('export * from "../adapters/starrylink/index.js"; import("../rescue.js"); interface Input { signalStrength:number }; const schema="災害";','negative.ts');expect(bad.imports).toHaveLength(2);expect(bad.words).toContain('signalStrength');expect(bad.words).toContain('災害');expect(inspect('// StarryLink migration comment\nconst status="UNKNOWN";','comment.ts').words).toEqual([]);
});
it('public entry adds optional semantic exports; Core stays isolated and server provider route stays disabled',()=>{
 expect(inspect(readFileSync('tests/compat/src/index.ts','utf8'),'index.ts').imports).toEqual(['./qa/core/index.js','./qa/semantic/contracts.js','./qa/semantic/reference.js','./qa/semantic/service.js','./qa/semantic/ollama.js']);const code=readFileSync('tests/compat/src/qa/server.ts','utf8');expect(inspect(code,'server.ts').imports.some(i=>/provider|service|control-plane/.test(i))).toBe(false);expect(code).not.toMatch(/loadProvider|process\.env|fetch\(/);expect(code).toContain('PROVIDER_ROUTE_DISABLED');
});
