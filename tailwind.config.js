/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every token that changes between the night race and the day race resolves
      // to a CSS variable, defined twice in index.css. That is what makes the
      // light/dark switch one attribute on <html> rather than a second set of
      // classes on every element — and it keeps the alpha modifiers working, so
      // `text-ceramic/45` is still a valid, theme-aware class.
      //
      // The few fixed ones below are fixed on purpose: a kerb is red and a
      // chequered flag is black and white in any light.
      colors: {
        cobalt: "#110FFF",
        void: "#070707",
        purple: "#7A2BF5",
        kerb: "#E01B2E",

        magenta: "rgb(var(--magenta) / <alpha-value>)",
        teal: "rgb(var(--teal) / <alpha-value>)",
        good: "rgb(var(--good) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        flag: "rgb(var(--flag) / <alpha-value>)",
        // Foreground. Named for the ceramic-white it is at night; it is near-black
        // by day, and it is what every piece of text on the page is drawn in.
        ceramic: "rgb(var(--ceramic) / <alpha-value>)",
        chassis: "rgb(var(--chassis) / <alpha-value>)",
        asphalt: "rgb(var(--asphalt) / <alpha-value>)",
        // Trackside surfaces. A timing screen has no glass in it: panels are
        // painted metal, so they get a solid colour, not a blur.
        pit: "rgb(var(--pit) / <alpha-value>)",
        pitlight: "rgb(var(--pitlight) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        // Anything recessed into a panel — input wells, code blocks, the passage
        // box. Always used with an alpha, so it tints the panel behind it.
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        // Text drawn on top of a bright accent fill. Near-black on teal at night,
        // white on the darker teal by day; neither theme can use the other's.
        accentink: "rgb(var(--accentink) / <alpha-value>)",
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
