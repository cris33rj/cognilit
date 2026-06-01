import { z } from "zod";

export const searchSchema = z.object({
  queryString: z.string().trim().min(1, "Informe a string de busca."),
  database: z.string().trim().min(1, "Informe a base consultada."),
  searchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  hits: z.coerce.number().int().min(0, "Hits não pode ser negativo."),
});

export type SearchInput = z.infer<typeof searchSchema>;
