import { createFileRoute } from "@tanstack/react-router";
import { ExamAnalysisPage } from "@/components/notebook/exam-analysis";
export const Route = createFileRoute("/exam-analysis/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: s.view === "read" ? ("read" as const) : ("overview" as const),
  }),
  head: () => ({ meta: [{ title: "分析卷子 · 解集" }] }),
  component: () => {
    const { id } = Route.useParams();
    const { view } = Route.useSearch();
    return <ExamAnalysisPage key={id} id={id} view={view} />;
  },
});
