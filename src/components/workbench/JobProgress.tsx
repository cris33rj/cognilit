"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const TERMINAL = ["completed", "completed_with_errors", "failed"];

export function JobProgress({ jobId }: { jobId: string }) {
  const { data } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("job")
        .select("status, progress")
        .eq("id", jobId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: (q) =>
      q.state.data && TERMINAL.includes(q.state.data.status) ? false : 800,
  });

  if (!data) return null;
  return (
    <div aria-live="polite" className="text-sm">
      Processamento: <strong>{data.status}</strong> ({data.progress}%)
    </div>
  );
}
