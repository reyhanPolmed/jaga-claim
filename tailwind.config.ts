import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#F1F3EB",
          100: "#E3E9E4",
          200: "#CBD6CE",
          300: "#B5C4BA",
          600: "#435450",
          700: "#2F3B3A",
          800: "#26312F",
          900: "#1D2725",
        },
        navy: {
          900: "#102A43",
          800: "#1E3A5F",
          700: "#243B53",
        },
        teal: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
        },
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        danger: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B",
        },
        warning: {
          50: "#FEFCE8",
          100: "#FEF9C3",
          600: "#CA8A04",
          700: "#A16207",
          800: "#854D0E",
        },
        success: {
          50: "#F0FDF4",
          100: "#DCFCE7",
          600: "#16A34A",
          700: "#15803D",
          800: "#166534",
        },
        app: {
          bg: "#F8FAFC",
          surface: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        mono: ["var(--font-poppins)", "system-ui", "sans-serif"],
        serif: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
