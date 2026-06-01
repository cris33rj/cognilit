// Edge Function (Deno) — casca HTTP sobre enqueueImportJob (D-F3.1/contrato async-jobs).
import { createClient } from "@supabase/supabase-js";
import { enqueueImportJob } from "../_shared/jobs/enqueue.ts";
import { EnqueueValidationError } from "../_shared/jobs/types.ts";

Deno.serve(async (req: Request) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const body = await req.json();
    const { review_id, type, payload } = body;
    if (type !== "import_parse") {
      return Response.json({ error: "tipo não suportado" }, { status: 400 });
    }
    // Cliente com o JWT do chamador → RLS valida membership.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const result = await enqueueImportJob({ supabase }, review_id, payload);
    return Response.json(result, { status: 202 });
  } catch (e) {
    if (e instanceof EnqueueValidationError) {
      return Response.json({ error: e.message }, { status: 400 }); // FR-016
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
