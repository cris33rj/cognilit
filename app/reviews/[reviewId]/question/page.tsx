import { getQuestion, listCriteria } from "@/lib/question/queries";
import { getByokStatus } from "@/lib/byok/queries";
import { getProtocol } from "@/lib/protocol/queries";
import { QuestionForm } from "@/components/question/QuestionForm";
import { CriteriaPanel } from "@/components/question/CriteriaPanel";
import { ByokKeyForm } from "@/components/ai/ByokKeyForm";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const [question, criteria, byok, protocol] = await Promise.all([
    getQuestion(reviewId),
    listCriteria(reviewId),
    getByokStatus(reviewId),
    getProtocol(reviewId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="title-serif">Pergunta da Revisão</h1>
      <QuestionForm reviewId={reviewId} initial={question} />
      <section className="panel flex flex-col gap-2">
        <p className="panel-title">Chave de IA (BYOK)</p>
        <ByokKeyForm reviewId={reviewId} present={byok.present} />
      </section>
      <CriteriaPanel
        reviewId={reviewId}
        criteria={criteria}
        canDerive={!!question && byok.present}
        locked={protocol?.state === "locked"}
      />
    </div>
  );
}
