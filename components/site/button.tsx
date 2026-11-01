import Link from "next/link";
import { type ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-dark text-white hover:bg-accent-hover shadow-sm",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 hover:bg-zinc-50",
  outline:
    "border border-white/30 bg-transparent text-white hover:bg-white/10",
  ghost: "text-zinc-600 hover:text-black",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-4 py-2 text-sm rounded-xl",
  md: "min-h-11 px-6 py-3 text-sm rounded-xl",
  lg: "min-h-12 px-8 py-4 text-base rounded-xl",
};

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: Variant;
  size?: Size;
};

type LinkButtonProps = ComponentPropsWithoutRef<typeof Link> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 font-medium transition-[color,background-color,border-color,transform,box-shadow] duration-200 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

type AnchorButtonProps = ComponentPropsWithoutRef<"a"> & {
  variant?: Variant;
  size?: Size;
};

export function AnchorButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: AnchorButtonProps) {
  return (
    <a
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
