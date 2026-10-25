import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

const aliases = {
  '@shared': path.resolve(__dirname, 'src/shared'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer')
};

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: path.join(__dirname, 'src/main/index.ts'),
        vite: {
          resolve: {
            alias: aliases
          },
          build: {
            outDir: path.join(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['ws', 'node:sqlite']
            }
          }
        }
      },
      {
        entry: path.join(__dirname, 'src/preload/index.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          resolve: {
            alias: aliases
          },
          build: {
            outDir: path.join(__dirname, 'dist/preload')
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: aliases
  },
  root: path.join(__dirname, 'src/renderer'),
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
        overlay: path.resolve(__dirname, 'src/renderer/overlay.html')
      }
    }
  }
});
