/**
 * Funciones estadísticas compartidas para resúmenes de partidas (`ParsedMatchSummary`).
 *
 * Las usan tanto `MatchParser` (T-3.5) como la capa de datos SQLite (T-3.2),
 * garantizando que KDA y CS/minuto se calculen de forma idéntica en toda la app.
 */

/** Redondea a dos decimales (evita arrastrar precisión flotante a la UI). */
export function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * KDA estándar: `(asesinatos + asistencias) / muertes`, redondeado a 2 decimales.
 * Con cero muertes se devuelve la suma directa (KDA perfecta).
 */
export function calcularKda(asesinatos: number, muertes: number, asistencias: number): number {
  const participaciones = asesinatos + asistencias;
  if (muertes <= 0) {
    return redondear2(participaciones);
  }
  return redondear2(participaciones / muertes);
}

/**
 * CS por minuto a partir del CS total y la duración de la partida en segundos.
 * Devuelve 0 si la duración es inválida (partidas remakes/parciales).
 */
export function calcularCsPorMinuto(cs: number, duracionSegundos: number): number {
  if (duracionSegundos <= 0) {
    return 0;
  }
  return redondear2(cs / (duracionSegundos / 60));
}
