// Shared output types of the engine so the UI can render them (ExplainMath).
import { z } from 'zod';

export const CalcStep = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  formula: z.string(),
  inputs: z.record(z.string(), z.string()),
  result: z.string(),
});
export type CalcStep = z.infer<typeof CalcStep>;

export const Assumption = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  editable: z.boolean(),
});
export type Assumption = z.infer<typeof Assumption>;
