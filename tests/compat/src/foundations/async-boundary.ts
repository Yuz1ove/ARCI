/** Process-wide admission. A timed-out provider retains its lease until it actually settles. */
export interface CallBudget {key:object|string;timeoutMs:number;signal?:AbortSignal;maximumPending?:number}
interface Lane {active:boolean;queue:Array<()=>void>}
const objects=new WeakMap<object,Lane>(),strings=new Map<string,Lane>();
export function boundedCall<T>(work:(signal:AbortSignal)=>Promise<T>,options:CallBudget):Promise<T> {
 if(!Number.isFinite(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>120000)return Promise.reject(new Error('CALL_BUDGET_INVALID'));
 const maximum=options.maximumPending??4;if(!Number.isInteger(maximum)||maximum<0||maximum>32)return Promise.reject(new Error('CALL_BUDGET_INVALID'));
 let lane=typeof options.key==='string'?strings.get(options.key):objects.get(options.key);
 if(!lane){lane={active:false,queue:[]};if(typeof options.key==='string')strings.set(options.key,lane);else objects.set(options.key,lane);}
 const current=lane;
 if(options.signal?.aborted)return Promise.reject(new Error('CALL_CANCELLED'));
 if(current.active&&current.queue.length>=maximum)return Promise.reject(new Error('CALL_BUSY'));
 return new Promise<T>((resolve,reject)=>{
  const controller=new AbortController();let done=false,started=false;
  const clean=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);};
  const end=(error:unknown,value?:T)=>{if(done)return;done=true;clean();if(error!==null)reject(error);else resolve(value as T);};
  const remove=()=>{const i=current.queue.indexOf(start);if(i>=0)current.queue.splice(i,1);};
  const cancel=()=>{controller.abort();if(!started)remove();end(new Error('CALL_CANCELLED'));};
  const timer=setTimeout(()=>{controller.abort();if(!started)remove();end(new Error('CALL_TIMEOUT'));},options.timeoutMs);
  const start=()=>{
   if(done)return;started=true;current.active=true;
   let pending:Promise<T>;try{pending=Promise.resolve(work(controller.signal));}catch(error){pending=Promise.reject(error);}
   pending.then(value=>end(null,value),error=>end(error)).finally(()=>{
    current.active=false;const next=current.queue.shift();if(next)next();else if(typeof options.key==='string')strings.delete(options.key);
   });
  };
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(current.active)current.queue.push(start);else start();
 });
}
