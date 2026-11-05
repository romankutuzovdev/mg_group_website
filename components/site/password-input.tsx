"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Layout classes (margins) go here: the wrapper must match the input's height. */
  wrapperClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, wrapperClassName, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const label = visible ? "Скрыть пароль" : "Показать пароль";
    const Icon = visible ? EyeOff : Eye;

    return (
      <div className={cn("relative", wrapperClassName)}>
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn(className, "pr-11 [&::-ms-reveal]:hidden")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={label}
          aria-pressed={visible}
          title={label}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-stone-400 transition hover:text-stone-700 focus-visible:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  },
);
