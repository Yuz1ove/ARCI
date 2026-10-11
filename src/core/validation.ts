export function assertBounded(value:unknown): void {
 const seen = new Set<object>();
 function visit(v:unknown,depth:number):void {
  if(depth>16) throw new Error('DEPTH_LIMIT');
  if(v===null || typeof v==='boolean' || typeof v==='string') return;
  if(typeof v==='number' && Number.isFinite(v)) return;
  if(typeof v!=='object' || seen.has(v)) throw new Error('INVALID_JSON_VALUE');
  if(!Array.isArray(v) && Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null) throw new Error('INVALID_OBJECT');
  seen.add(v);
  for(const [key,child] of Object.entries(v)) {
   if(['__proto__','constructor','prototype'].includes(key)) throw new Error('UNSAFE_KEY');
   visit(child,depth+1);
  }
  seen.delete(v);
 }
 visit(value,0);
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>1000000) throw new Error('SIZE_LIMIT');
}
