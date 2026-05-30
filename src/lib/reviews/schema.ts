import { z } from "zod";

export const createReviewSchema = z.object({
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Informe um título para a Revisão")),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
