// app/reviews/[reviewId]/prisma/page.tsx
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";

export const dynamic = "force-dynamic";

export default async function PrismaFlowPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const model = await loadPrismaFlowModel(reviewId); // RLS escopa via views
  return <PrismaFlowchart reviewId={reviewId} model={model} />;
}
