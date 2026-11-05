import { createFileRoute } from "@tanstack/react-router";
import { StudyPlansPage } from "@/components/study-plans/pages";
export const Route = createFileRoute("/study-plans/")({
  head: () => ({ meta: [{ title: "备考定制 · 解集" }] }),
  component: StudyPlansPage,
});
