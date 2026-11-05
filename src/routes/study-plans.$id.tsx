import { createFileRoute } from "@tanstack/react-router";
import { StudyPlanPage } from "@/components/study-plans/pages";
export const Route = createFileRoute("/study-plans/$id")({
  head: () => ({ meta: [{ title: "备考计划 · 解集" }] }),
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  return <StudyPlanPage key={id} id={id} />;
}
