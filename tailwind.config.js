/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // GenLayer brand.
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
        // Trackside surfaces and signals. A timing screen has no glass in it:
        // panels are painted metal, so they get a solid colour, not a blur.
        pit: "#0E0E12",
        pitlight: "#15151B",
        line: "#26262F",
        kerb: "#E01B2E",
        flag: "#FFD500",
      },
      fontFamily: {
        display: ['"Chakra Petch"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        num: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Hard offset, no blur: signage sits on the wall, it does not float.
        hard: "4px 4px 0 rgba(0,0,0,0.65)",
        hardsm: "2px 2px 0 rgba(0,0,0,0.6)",
        lit: "0 0 0 1px rgba(47,225,214,0.5), 0 0 18px rgba(47,225,214,0.18)",
      },
      backgroundImage: {
        // The red/white kerb stripe. The chequer lives in index.css instead: it
        // needs a background-size as well, and size is not part of a
        // background-image value, so setting it here silently drew nothing.
        kerb: "repeating-linear-gradient(115deg, #E01B2E 0 14px, #F5F5F5 14px 28px)",
      },
    },
  },
  plugins: [],
};
