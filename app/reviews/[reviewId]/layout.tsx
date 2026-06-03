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
      <header className="flex items-center gap-4 border-b p-4">
        <a href="/reviews" className="text-sm underline">
          Minhas Revisões
        </a>
        <a href="/reviews/new" className="text-sm underline">
          Nova Revisão
        </a>
        <ReviewSwitcher reviews={reviews} activeId={active.id} />
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm underline">
            Sair
          </button>
        </form>
      </header>

      <PrismaBar counters={counters} />

      <div className="flex gap-6 p-6">
        <PhaseRail phases={phases} />
        <main className="min-w-0 flex-1">{children}</main>
        <QueryProvider>
          <JobsPanel reviewId={reviewId} data={jobsUsage} />
        </QueryProvider>
      </div>
    </div>
  );
}
