import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends ComponentPropsWithoutRef<typeof BaseButton> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant = "outline", size = "md", ...props }: ButtonProps) {
  const resolvedClassName = typeof className === "function"
    ? (state: Parameters<typeof className>[0]) => cx("ui-button", `is-${variant}`, `is-${size}`, className(state))
    : cx("ui-button", `is-${variant}`, `is-${size}`, className);
  return <BaseButton className={resolvedClassName} {...props} />;
}

export function ButtonGroup({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div role="group" className={cx("ui-button-group", className)} {...props} />;
}
