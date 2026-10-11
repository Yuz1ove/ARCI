import { z } from 'zod';
import { commonInputSchema } from '../shared.js';
export const conditionsSchema = z.object({ network: z.enum(['available', 'unavailable', 'unknown']), battery: z.number().min(0).max(100).nullable(), priority: z.enum(['normal', 'urgent', 'unknown']), channels: z.array(z.enum(['mobile', 'radio', 'wired'])).max(3) }).strict();
export const starrylinkInputSchema=commonInputSchema.extend(conditionsSchema.shape).strict();
export type StarryLinkInput=z.infer<typeof starrylinkInputSchema>;
