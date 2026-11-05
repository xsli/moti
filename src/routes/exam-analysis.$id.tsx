import { createFileRoute } from "@tanstack/react-router";
import { ExamAnalysisPage } from "@/components/notebook/exam-analysis";
export const Route = createFileRoute("/exam-analysis/$id")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { view: "read" | "overview"; questions?: string } => ({
    view: s.view === "read" ? ("read" as const) : ("overview" as const),
    questions: typeof s.questions === "string" ? s.questions.slice(0, 20000) : undefined,
  }),
  head: () => ({ meta: [{ title: "分析卷子 · 解集" }] }),
  component: function ExamAnalysisRoute() {
    const { id } = Route.useParams();
    const { view, questions } = Route.useSearch();
    return (
      <ExamAnalysisPage
        key={`${id}:${questions || ""}`}
        id={id}
        view={view}
        questions={questions}
      />
    );
  },
});
