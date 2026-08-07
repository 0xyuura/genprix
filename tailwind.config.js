/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cobalt: "#110FFF",
        void: "#070707",
        magenta: "#E63BD3",
        purple: "#7A2BF5",
        teal: "#2FE1D6",
        good: "#00FF66",
        bad: "#FF3B4E",
        amber: "#F5C542",
        ceramic: "#F5F5F5",
        chassis: "#CACACA",
        asphalt: "#606060",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        arcade: "0 6px 0 rgba(0,0,0,0.45), 0 14px 34px rgba(122,43,245,0.35)",
      },
    },
  },
  plugins: [],
};
