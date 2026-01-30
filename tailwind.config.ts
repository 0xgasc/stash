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
        accent: {
          cyan: "#7dd3c0",
          green: "#86c08e",
          red: "#d47070",
          blue: "#7a9ec2",
          orange: "#c4956a",
        },
      },
      boxShadow: {
        'brutal': '3px 3px 0px 0px #7dd3c0',
        'brutal-red': '3px 3px 0px 0px #d47070',
        'brutal-sm': '2px 2px 0px 0px #7dd3c0',
        'glow': '0 0 15px rgba(125, 211, 192, 0.1)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
