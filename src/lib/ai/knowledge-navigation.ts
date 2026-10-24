import { knowledgeScopeSchema, type KnowledgeScope } from "./knowledge-schema.ts";

export type KnowledgePageSearch = { collectionId?: string; problemIds?: string[]; returnTo?: string };

export function knowledgeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 10000 || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return;
  const url = new URL(value, "http://local.invalid");
  if (url.origin !== "http://local.invalid" || !(url.pathname === "/" || /^\/(?:p|read)\/[^/]+$/.test(url.pathname))) return;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function knowledgePageSearch(search: Record<string, unknown>): KnowledgePageSearch {
  return {
    ...(search.collectionId !== undefined ? { collectionId: typeof search.collectionId === "string" ? search.collectionId : "" } : {}),
    ...(search.problemIds !== undefined ? { problemIds: Array.isArray(search.problemIds) && search.problemIds.every(id => typeof id === "string") ? search.problemIds : [] } : {}),
    returnTo: knowledgeReturnTo(search.returnTo),
  };
}

export function knowledgePageScope(search: KnowledgePageSearch): KnowledgeScope | null {
  if (search.collectionId !== undefined && search.problemIds !== undefined) return null;
  const result = knowledgeScopeSchema.safeParse(search);
  return result.success ? result.data : null;
}

export function knowledgeFallback(scope: KnowledgeScope): string {
  if ("collectionId" in scope) return `/?g=${encodeURIComponent(scope.collectionId)}`;
  return scope.problemIds.length === 1 ? `/p/${encodeURIComponent(scope.problemIds[0])}` : "/";
}
