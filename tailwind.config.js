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
        },
        p3r: {
          blue: '#00D4FF',
          neon: '#00F0FF',
          deep: '#030813',
          dark: '#061021',
          navy: '#0A1830',
          card: '#0D2040',
          cardHover: '#132C57',
          border: '#1B3B6F',
          borderGlow: '#00D4FF88',
          accent: '#FFD700',
          crimson: '#FF2E63'
        }
      }
    },
  },
  plugins: [],
}
