// Edge Function (Deno) agendada por pg_cron (D-F3.5). Processa jobs queued.
import { createClient } from "@supabase/supabase-js";
import { processImportJob } from "../_shared/jobs/worker.ts";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: jobs } = await supabase
    .from("job")
    .select("id")
    .eq("type", "import_parse")
    .in("status", ["queued", "running"]);
  const results = [];
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    results.push(await processImportJob({ supabase }, j.id));
  }
  return Response.json({ processed: results }, { status: 200 });
});
