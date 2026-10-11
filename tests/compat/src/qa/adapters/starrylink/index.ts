import { known,unknown } from '../../core/contracts.js';
import { createExampleAdapter,sourceContentSchema,ref } from '../shared.js';
import { conditionsSchema,starrylinkInputSchema } from './schema.js';
export { conditionsSchema,starrylinkInputSchema } from './schema.js';
export const starrylinkAdapter=createExampleAdapter('starrylink',starrylinkInputSchema,(p,input,snapshot)=>{
 for(const s of snapshot.sources){const d=sourceContentSchema.parse(s.content);const parsed=conditionsSchema.safeParse(d.conditions);
  p.add(s.sourceId+':conditions',parsed.success?known({network:input.network,battery:input.battery,priority:input.priority,channels:input.channels}):unknown('CONDITIONS_MISSING'),'EQUALS',parsed.success?known(parsed.data):unknown('CONDITIONS_MISSING'),parsed.success?'使用者條件與合成來源比較；不同時保留衝突，未自動覆蓋。':'沒有結構化通訊條件。',parsed.success?[ref(s,'conditions')]:[]);
 }
 p.add('battery',known(input.battery),'GREATER_THAN',known(0),`輸入電量 ${input.battery??'未知'}%；僅檢查是否有電。`,snapshot.sources.map(s=>ref(s,'conditions.battery')));
 p.add('channels',input.channels.length?known(input.channels.length):unknown('CHANNELS_UNSPECIFIED'),'GREATER_THAN',known(0),'僅確認使用者列出通道，不代表實際可連線。',snapshot.sources.map(s=>ref(s,'conditions.channels')));
 p.add('network',input.network==='unknown'?unknown('NETWORK_UNSPECIFIED'):known(!(input.network==='unavailable'&&input.channels.includes('mobile'))),'EQUALS',known(true),'行動網路中斷與使用 mobile 通道的條件衝突檢查。',snapshot.sources.map(s=>ref(s,'conditions.network')));
 p.add('priority',input.priority==='unknown'?unknown('PRIORITY_UNSPECIFIED'):known(input.priority),'PRESENT',known(true),`訊息優先程度 ${input.priority}；未計算路由權重。`,snapshot.sources.map(s=>ref(s,'conditions.priority')));
});
