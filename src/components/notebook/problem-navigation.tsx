import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { saveNavigation } from "@/lib/problems/navigation";

const NavigationContext = createContext<string | undefined>(undefined);

export function ProblemNavigationScope({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [key, setKey] = useState<string>();
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => { if (key) saveNavigation(key, ids); }, [key, ids]);
  return <NavigationContext.Provider value={key}>{children}</NavigationContext.Provider>;
}

export function useProblemNavigationKey() {
  return useContext(NavigationContext);
}
