/**
 * tests/shared/aumentosTier.test.ts
 * Pruebas unitarias para la regla determinista de asignación de tier y selección del mejor aumento.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularTierAumento,
  seleccionarMejorAumento,
  type AumentoTier,
} from '../../src/shared/types';

describe('Aumentos - Asignación Determinista de Tier y Selección Óptima', () => {
  it('calcula tiers S+, S, A, B, C, D según winRate y pickRate con muestra suficiente', () => {
    // Alto winrate y presencia -> S+
    expect(calcularTierAumento(58.5, 12.0, 500)).toBe('S+');

    // Muy buen winrate -> S
    expect(calcularTierAumento(54.0, 8.5, 300)).toBe('S');

    // Winrate positivo y presencia estándar -> A
    expect(calcularTierAumento(51.5, 5.0, 200)).toBe('A');

    // Winrate neutro -> B
    expect(calcularTierAumento(48.5, 4.0, 150)).toBe('B');

    // Winrate bajo -> C o D
    expect(calcularTierAumento(44.0, 2.0, 100)).toBe('C');
    expect(calcularTierAumento(38.0, 1.0, 80)).toBe('D');
  });

  it('evalúa de forma conservadora ante muestras reducidas (< 30 partidas)', () => {
    // Aunque tenga 70% winrate, con muestra baja no otorga S+
    const tierMuestraPequena = calcularTierAumento(70.0, 15.0, 15);
    expect(['A', 'B']).toContain(tierMuestraPequena);
  });

  it('selecciona y resalta la mejor opción con esMejorOpcion: true', () => {
    const aumentos: AumentoTier[] = [
      {
        idModo: 101,
        apiName: 'SilverOption',
        nombre: 'Opción Plata',
        icono: 'icon1.png',
        rareza: 'Plata',
        tier: 'B',
        winRate: 48.0,
        pickRate: 3.5,
        muestras: 250,
        actualizadoEn: Date.now(),
        fuente: 'opgg_mcp',
      },
      {
        idModo: 102,
        apiName: 'GoldGodOption',
        nombre: 'Opción Oro Dios',
        icono: 'icon2.png',
        rareza: 'Oro',
        tier: 'S+',
        winRate: 59.2,
        pickRate: 14.8,
        muestras: 850,
        actualizadoEn: Date.now(),
        fuente: 'opgg_mcp',
      },
      {
        idModo: 103,
        apiName: 'DecentOption',
        nombre: 'Opción Decente',
        icono: 'icon3.png',
        rareza: 'Oro',
        tier: 'A',
        winRate: 52.1,
        pickRate: 6.0,
        muestras: 400,
        actualizadoEn: Date.now(),
        fuente: 'opgg_mcp',
      },
    ];

    const mejor = seleccionarMejorAumento(aumentos);
    expect(mejor).not.toBeNull();
    expect(mejor?.apiName).toBe('GoldGodOption');
    expect(mejor?.tier).toBe('S+');
    expect(mejor?.esMejorOpcion).toBe(true);
  });

  it('devuelve null si la lista de aumentos está vacía', () => {
    expect(seleccionarMejorAumento([])).toBeNull();
  });
});
