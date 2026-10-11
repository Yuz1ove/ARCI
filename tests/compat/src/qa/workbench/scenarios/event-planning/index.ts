import { known,unknown } from '../../../core/contracts.js';
import { createExampleAdapter,sourceContentSchema,ref } from '../../../adapters/shared.js';
import { rulesSchema,eventInputSchema } from './schema.js';
export const eventPlanningAdapter=createExampleAdapter('event-planning',eventInputSchema,(p,input,snapshot)=>{
 for(const s of snapshot.sources){const d=sourceContentSchema.parse(s.content),parsed=rulesSchema.safeParse(d.rules);
  if(!parsed.success) p.add(s.sourceId+':rules',unknown('STRUCTURED_RULES_MISSING'),'PRESENT',known(true),'此文件無經 schema 驗證的規則；不從自由文字推測。',d.paragraphs.map((_,i)=>ref(s,`paragraphs.${i}`)));
  else {const rules=parsed.data;
   p.add(s.sourceId+':deadline',known(input.at),'LESS_OR_EQUAL',known(rules.deadline),`截止條件：${rules.deadline}。`,[ref(s,'rules.deadline')]);
   p.add(s.sourceId+':capacity',known(input.participants),'LESS_OR_EQUAL',known(rules.capacity),`人數 ${input.participants??'未知'}；上限 ${rules.capacity}。`,[ref(s,'rules.capacity')]);
  }
 }
});
