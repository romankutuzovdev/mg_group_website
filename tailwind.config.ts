import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  mode: "jit",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          /* MG.GROUP page tokens (from Desktop/website) */
          brand: "#22c55e",
          light: "#4ade80",
          dark: "#1b5e20",
          hover: "#0d3f10",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "bg-base": "#fafaf9",
        "bg-elevated": "#ffffff",
        "bg-card": "#ffffff",
        "bg-dark": "#0c0a09",
        "bg-dark-elevated": "#1c1917",
        "border-strong": "#d6d3d1",
        "text-primary": "#0c0a09",
        "text-secondary": "#57534e",
        "text-muted": "#78716c",
        "text-on-dark": "#ffffff",
        "text-on-dark-muted": "rgba(255, 255, 255, 0.72)",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        sans: ["var(--font-cormorant)", "Georgia", "Times New Roman", "serif"],
        display: ["var(--font-cormorant)", "Georgia", "Times New Roman", "serif"],
        serif: ["var(--font-cormorant)", "Georgia", "Times New Roman", "serif"],
        mono: ["var(--font-cormorant)", "Georgia", "serif"],
      },
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.4" }],
        sm: ["1rem", { lineHeight: "1.5" }],
        base: ["1.125rem", { lineHeight: "1.55" }],
        lg: ["1.25rem", { lineHeight: "1.5" }],
        xl: ["1.375rem", { lineHeight: "1.4" }],
        "2xl": ["1.625rem", { lineHeight: "1.3" }],
        "3xl": ["1.95rem", { lineHeight: "1.25" }],
        "4xl": ["2.35rem", { lineHeight: "1.2" }],
        "5xl": ["3rem", { lineHeight: "1.12" }],
        "6xl": ["3.75rem", { lineHeight: "1.08" }],
        "7xl": ["4.5rem", { lineHeight: "1.05" }],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hero-ken": {
          from: { transform: "scale(1.05)" },
          to: { transform: "scale(1.12)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up-delay-1": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both",
        "fade-up-delay-2": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.24s both",
        "fade-up-delay-3": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.36s both",
        "hero-ken": "hero-ken 18s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
