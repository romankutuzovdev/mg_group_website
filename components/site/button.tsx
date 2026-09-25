import Link from "next/link";
import { type ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#1B5E20] text-white hover:bg-[#0D3F10] shadow-sm",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500 hover:bg-zinc-50",
  outline:
    "border border-white/30 bg-transparent text-white hover:bg-white/10",
  ghost: "text-zinc-600 hover:text-black",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-4 py-2 text-sm rounded-md",
  md: "min-h-11 px-6 py-3 text-sm rounded-md",
  lg: "min-h-12 px-8 py-4 text-base rounded-md",
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
  "inline-flex items-center justify-center gap-2 font-medium transition-[color,background-color,border-color,transform,box-shadow] duration-200 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
