import { z } from "zod";

export const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
] as const;
export type ExtractionFieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<ExtractionFieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Data",
  boolean: "Booleano",
  select: "Escolha de lista",
};

/** Entrada de um campo no builder. select ⇒ options não-vazio (FR-009). */
export const extractionFieldInputSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome para o campo."),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (v) =>
      v.type !== "select" || (v.options !== undefined && v.options.length > 0),
    {
      message: "Campos de escolha exigem ao menos uma opção.",
      path: ["options"],
    },
  );

export type ExtractionFieldInput = z.infer<typeof extractionFieldInputSchema>;
