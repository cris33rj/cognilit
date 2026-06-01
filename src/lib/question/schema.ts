import { z } from "zod";

export const FRAMEWORKS = ["spider", "pico", "peo", "pcc", "free"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

// Campos exibidos por framework (labels pt-BR vivem na UI; aqui só as chaves).
export const FRAMEWORK_FIELDS: Record<Framework, string[]> = {
  spider: ["sample", "phenomenon", "design", "evaluation", "researchType"],
  pico: ["population", "intervention", "comparison", "outcome"],
  peo: ["population", "exposure", "outcome"],
  pcc: ["population", "concept", "context"],
  free: [],
};

export const questionSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  questionText: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Formule a pergunta")),
  fields: z.record(z.string(), z.string()).default({}),
});

export type QuestionInput = z.infer<typeof questionSchema>;
