import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KnowledgeScope } from "@/lib/ai/knowledge-schema";
import { knowledgeReturnTo } from "@/lib/ai/knowledge-navigation";

export function KnowledgeLink({ scope, label = "知识沉淀", disabled = false }: { scope: KnowledgeScope; label?: string; disabled?: boolean }) {
  const href = useLocation({ select: location => location.href });
  if (disabled) return <Button size="sm" variant="outline" disabled><BookOpen className="size-4" />{label}</Button>;
  return <Button size="sm" variant="outline" asChild><Link to="/knowledge" search={{ ...scope, returnTo: knowledgeReturnTo(href) }}><BookOpen className="size-4" />{label}</Link></Button>;
}
