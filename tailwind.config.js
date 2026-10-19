/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lol: {
          gold: '#C89B3C',
          darkBlue: '#0A1428',
          hextech: '#0AC8B9',
          navy: '#091428',
          card: '#1E2328'
        }
      }
    },
  },
  plugins: [],
}
