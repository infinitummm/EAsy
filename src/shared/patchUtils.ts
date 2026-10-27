/**
 * Utilidades de normalización y formateo de versiones de parches de League of Legends.
 * Mapea la nomenclatura del cliente oficial (ej: 26.20 para la Temporada 2026)
 * con los recursos y CDN de Data Dragon (ej: 16.20.1).
 */

export function formatDisplayPatch(patch?: string): string {
  if (!patch) return '26.20';
  // Si Data Dragon devuelve 16.X.Y (Temporada 2026), el cliente de LoL muestra 26.X
  if (patch.startsWith('16.')) {
    const parts = patch.slice(3).split('.');
    return `26.${parts[0]}`;
  }
  return patch;
}

export function formatFullPatchLabel(patch?: string): string {
  const display = formatDisplayPatch(patch);
  if (patch && display !== patch) {
    return `${display} (${patch})`;
  }
  return display;
}

/**
 * Normaliza cualquier versión de parche (display 26.20, incompleta 16.20 o vacía)
 * a una versión canónica de 3 partes válida para la CDN de Riot Data Dragon (ej. 16.20.1).
 */
export function toDdragonVersion(patch?: string): string {
  if (!patch) return '16.20.1';
  // Si viene con nomenclatura de display 26.X o 26.X.Y, convertir a 16.X.1
  if (patch.startsWith('26.')) {
    const parts = patch.slice(3).split('.');
    return `16.${parts[0]}.${parts[1] || '1'}`;
  }
  const parts = patch.split('.');
  if (parts.length === 2) {
    return `${patch}.1`;
  }
  return patch;
}
