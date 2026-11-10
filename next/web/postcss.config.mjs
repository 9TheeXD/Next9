// Tailwind v4 runs as a PostCSS plugin. Preflight (Tailwind's base reset) is deliberately not
// imported — see globals.css — so nothing here touches the hand-written stylesheets the rest of the
// site is built on.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
