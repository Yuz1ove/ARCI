import { z } from 'zod';
import { commonInputSchema } from '../../../adapters/shared.js';
const short=z.string().trim().min(1).max(180);
export const rulesSchema = z.object({ deadline: z.string().datetime(), capacity: z.number().int().min(1).max(10000), action: short }).strict();
export const eventInputSchema=commonInputSchema.extend({participants:z.number().int().min(1).max(10000).nullable()}).strict();
