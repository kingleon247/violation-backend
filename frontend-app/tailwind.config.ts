import type { Config } from "tailwindcss";
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/app/components/catalyst/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
