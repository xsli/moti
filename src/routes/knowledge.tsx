import { createFileRoute, Link } from "@tanstack/react-router";
import { KnowledgeReader } from "@/components/notebook/knowledge-reader";
import { BackButton } from "@/components/ui/back-button";
import { knowledgeFallback, knowledgePageScope, knowledgePageSearch } from "@/lib/ai/knowledge-navigation";
import { knowledgeScopeKey } from "@/lib/ai/knowledge-schema";
import { useProblemStore } from "@/lib/problems/store";

export const Route = createFileRoute("/knowledge")({
  validateSearch: knowledgePageSearch,
  head: () => ({ meta: [{ title: "知识沉淀 · 解集" }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const search = Route.useSearch();
  const scope = knowledgePageScope(search);
  const collections = useProblemStore(s => s.collections);
  const problems = useProblemStore(s => s.problems);
  if (!scope) return <div className="space-y-4 py-12"><BackButton><Link to="/" /></BackButton><h1 className="text-xl font-semibold">请选择要阅读的知识沉淀</h1><p className="text-muted-foreground">请从讲次或题目页面进入，每次最多选择 40 道题。</p></div>;
  const collection = "collectionId" in scope ? collections.find(c => c.id === scope.collectionId) : undefined;
  const title = collection ? `${collection.groupName} · ${collection.name}` : "problemIds" in scope ? scope.problemIds.length === 1 ? problems.find(p => p.id === scope.problemIds[0])?.title : `${scope.problemIds.length} 道题的方法归纳` : undefined;
  return <KnowledgeReader key={knowledgeScopeKey(scope)} scope={scope} returnTo={search.returnTo || knowledgeFallback(scope)} sourceTitle={title} />;
}
