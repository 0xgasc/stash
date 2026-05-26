import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Hermes palette — Byzantine gold + deep teal + dark violet
        accent: {
          gold:    "#D4A853",   // primary — divine gold
          goldDim: "#A68A3E",   // muted gold (borders, dividers)
          teal:    "#0D9488",   // secondary — heraldic teal
          violet:  "#7C5CBF",   // tertiary — mystical
          rose:    "#C47A7A",   // danger / alert
        },
        surface: {
          dark:  "#0D0C0A",     // deepest background
          card:  "#141312",     // card surfaces
          hover: "#1C1A17",     // hover state
          border:"#26231E",     // subtle borders
        },
        gold: {
          50:  "#FCF9F2",
          100: "#F7EFD9",
          200: "#EFDEB3",
          300: "#E4C882",
          400: "#D4A853",
          500: "#C4983A",
          600: "#A87A2E",
          700: "#8C6327",
          800: "#6E4E24",
          900: "#5A4020",
          950: "#2E1F0E",
        },
      },
      boxShadow: {
        'golden':   '0 0 20px rgba(212, 168, 83, 0.12)',
        'golden-sm':'0 0 10px rgba(212, 168, 83, 0.08)',
        'golden-lg':'0 0 40px rgba(212, 168, 83, 0.15)',
        'inner-glow': 'inset 0 1px 0 rgba(212, 168, 83, 0.06)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['var(--font-serif)', 'Georgia', 'Times New Roman', 'serif'],
      },
      backgroundImage: {
        'marble': 'radial-gradient(ellipse at 30% 20%, rgba(212,168,83,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(13,148,136,0.03) 0%, transparent 50%)',
        'caduceus': 'radial-gradient(circle at 50% 50%, rgba(212,168,83,0.06) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
} satisfies Config;