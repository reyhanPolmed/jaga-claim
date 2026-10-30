import { z } from "zod";
import { claimIdSchema } from "./ml-contract";

export const explanationResponseSchema = z.object({
  claim_id: claimIdSchema,
  summary: z.string().trim().min(1).max(10000),
  checklist: z.array(z.string().max(10000)).max(1000),
  disclaimer: z.string().min(1).max(2000),
  source: z.enum(["template", "deepseek"]),
  llm_status: z.enum(["disabled", "no_reason_codes", "not_configured", "success", "fallback"]),
  prompt_version: z.string().min(1).max(200),
  llm_model: z.string().max(200).nullable(),
}).superRefine((value, ctx) => {
  if ((value.source === "deepseek") !== (value.llm_status === "success")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sumber penjelasan tidak konsisten" });
  }
});

export type MlExplanation = z.infer<typeof explanationResponseSchema>;
