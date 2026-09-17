import defaultTheme from "tailwindcss/defaultTheme";

const sharedSansStack = [
  "var(--font-noto-sans-looped)",
  "var(--font-geist-sans)",
  ...defaultTheme.fontFamily.sans,
];

const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      sans: sharedSansStack,
      serif: sharedSansStack,
      mono: sharedSansStack,
    },
  },
};

export default config;
