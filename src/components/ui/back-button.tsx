import { ArrowLeft } from "lucide-react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

type BackButtonProps = Omit<ButtonProps, "children" | "asChild" | "variant" | "size"> & {
  children?: ReactElement<{ children?: ReactNode }>;
};

export function BackButton({ children, ...props }: BackButtonProps) {
  const content = <><ArrowLeft aria-hidden="true" />返回</>;
  return (
    <Button type="button" {...props} variant="outline" size="sm" asChild={Boolean(children)}>
      {children ? cloneElement(children, { children: content }) : content}
    </Button>
  );
}
