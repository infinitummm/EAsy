/**
 * Declaraciones ambientales para importar archivos no-TS con Vite.
 * Permite `import esquema from './schema.sql?raw'` con tipado correcto
 * tanto en `tsc --noEmit` como en el empaquetado de Vite/Electron.
 */
declare module '*.sql?raw' {
  const contenido: string;
  export default contenido;
}
