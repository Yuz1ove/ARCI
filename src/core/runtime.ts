export interface CoreRuntime {id?:()=>string;now?:()=>string}
export const coreId=(runtime:CoreRuntime):string=>(runtime.id??(()=>globalThis.crypto.randomUUID()))();
export const coreNow=(runtime:CoreRuntime):string=>(runtime.now??(()=>new Date().toISOString()))();
