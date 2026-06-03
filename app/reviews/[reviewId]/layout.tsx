import { notFound } from "next/navigation";
import { getReviewById, listMyReviews } from "@/lib/reviews/queries";
import { ReviewSwitcher } from "@/components/reviews/ReviewSwitcher";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PhaseRail } from "@/components/shell/PhaseRail";
import { PrismaBar } from "@/components/shell/PrismaBar";
import { JobsPanel } from "@/components/shell/JobsPanel";
import { loadPhaseStates } from "@/lib/shell/phases";
import { getPrismaCounters } from "@/lib/prisma/queries";
import { getJobsAndUsage } from "@/lib/shell/usage";

export const dynamic = "force-dynamic";

export default async function ReviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const active = await getReviewById(reviewId);
  if (!active) notFound();

  const [reviews, phases, counters, jobsUsage] = await Promise.all([
    listMyReviews(),
    loadPhaseStates(reviewId),
    getPrismaCounters(reviewId),
    getJobsAndUsage(reviewId),
  ]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-6 border-b border-line bg-paper-card/70 px-6 py-4 backdrop-blur">
        <span className="title-serif text-xl">Cognilit</span>
        <a href="/reviews" className="text-sm text-ink-soft hover:text-ink">
          Minhas Revisões
        </a>
        <a href="/reviews/new" className="text-sm text-ink-soft hover:text-ink">
          Nova Revisão
        </a>
        <ReviewSwitcher reviews={reviews} activeId={active.id} />
        <form action="/auth/signout" method="post" className="ml-auto">
          <button
            type="submit"
            className="text-sm text-ink-soft hover:text-ink"
          >
            Sair
          </button>
        </form>
      </header>

      <PrismaBar counters={counters} />

      <div className="mx-auto grid max-w-[1320px] grid-cols-[248px_minmax(0,1fr)_268px] items-start">
        <PhaseRail phases={phases} />
        <main className="min-w-0 p-8">{children}</main>
        <QueryProvider>
          <JobsPanel reviewId={reviewId} data={jobsUsage} />
        </QueryProvider>
      </div>
    </div>
  );
}
