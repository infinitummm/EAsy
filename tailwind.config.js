/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/overlay.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        p3r: ['P3R-Display', 'Montserrat', 'sans-serif'],
        'p3r-head': ['P3R-Heading', 'Montserrat', 'sans-serif'],
        mono: ['Consolas', 'Fira Code', 'monospace'],
      },
      colors: {
        p3r: {
          bg: '#030814',           // Dark Hour Black/Navy
          panel: '#081329',        // Panel base
          panelAlt: '#0c1c38',     // Panel secundario ligeramente más claro
          border: '#16335f',       // Borde geométrico
          borderActive: '#00D4FF', // Borde activo cian
          blue: '#0066FF',         // Azul eléctrico P3R
          cyan: '#00E5FF',         // Cian acento
          cyanLight: '#B8F2FF',    // Blanco azulado
          yellow: '#FFE277',       // Acento amarillo pálido
          red: '#FF1744',          // Rojo sobrio
          green: '#00E676',        // Verde sobrio
          textMuted: '#7E9BB8',    // Texto secundario
          textDim: '#4A627E',      // Texto tenue
        },
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
