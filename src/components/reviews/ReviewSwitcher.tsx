"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ReviewListItem } from "@/lib/reviews/queries";

export function ReviewSwitcher({
  reviews,
  activeId,
}: {
  reviews: ReviewListItem[];
  activeId: string;
}) {
  const router = useRouter();
  // Disabled until client hydration is complete, so Playwright's selectOption
  // automatically waits for React event handlers to be attached before interacting.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <select
      aria-label="Revisão ativa"
      disabled={!hydrated}
      defaultValue={activeId}
      onChange={(e) => router.push(`/reviews/${e.target.value}`)}
      className="border p-2"
    >
      {reviews.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
    </select>
  );
}
