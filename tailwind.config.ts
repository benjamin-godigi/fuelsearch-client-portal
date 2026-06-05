import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Cabin", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "Consolas", "monospace"],
      },
      colors: {
        fuel: {
          navy: "#173d60",
          ink: "#162130",
          red: "#c9332b",
          mist: "#eef4f8",
        },
      },
      borderRadius: {
        xl: "0.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
