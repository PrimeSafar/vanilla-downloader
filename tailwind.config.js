/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        success: {
          DEFAULT: "#10b981",
          strong: "#059669",
          medium: "#6ee7b7",
        },
      },
      borderRadius: {
        base: "0.375rem",
      },
    },
  },
  plugins: [],
};
