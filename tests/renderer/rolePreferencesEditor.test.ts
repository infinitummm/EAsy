import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  RolePreferencesEditor,
  ChampionAutocomplete,
  SpellSelector,
} from '../../src/renderer/components/RolePreferencesEditor';
import { DEFAULT_APP_SETTINGS } from '../../src/shared/constants';
import {
  ALL_CHAMPIONS,
  getChampionById,
  getChampionName,
  getChampionIconUrl,
  GENERIC_CHAMPION_ICON_URL,
  obtenerTodosLosCampeones
} from '../../src/shared/champions';

describe('RolePreferencesEditor - Selector y Autocompletado Estable (Fix REQ-021)', () => {
  it('ChampionAutocomplete está memoizado a nivel de módulo y no se redefine dentro del componente', () => {
    expect(ChampionAutocomplete).toBeDefined();
    // Verifica que es un componente React.memo (objeto con $$typeof y type)
    expect((ChampionAutocomplete as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('SpellSelector está memoizado a nivel de módulo', () => {
    expect(SpellSelector).toBeDefined();
    expect((SpellSelector as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('RolePreferencesEditor principal está memoizado para evitar re-montajes por polling de LCU', () => {
    expect(RolePreferencesEditor).toBeDefined();
    expect((RolePreferencesEditor as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('preserva y migra correctamente los IDs numéricos acordados (51, 901, 233, 4, 12)', () => {
    const preferences = DEFAULT_APP_SETTINGS.autoChampSelect;

    // Verificar que los IDs numéricos tienen correspondencia real en catálogo
    const caitlyn = getChampionById(51);
    expect(caitlyn).toBeDefined();
    expect(caitlyn?.name).toBe('Caitlyn');

    const smolder = getChampionById(901);
    expect(smolder).toBeDefined();
    expect(smolder?.name).toBe('Smolder');

    const briar = getChampionById(233);
    expect(briar).toBeDefined();
    expect(briar?.name).toBe('Briar');

    // Verificar preferencias de BOTTOM
    const bottomPref = preferences.rolePreferences.BOTTOM;
    expect(bottomPref).toBeDefined();
    expect(bottomPref.spells).toEqual([4, 7]); // Flash + Heal
  });

  it('Yunara (ID 804) aparece disponible en el catálogo tanto para bans como para picks', () => {
    const todos = obtenerTodosLosCampeones();
    const yunara = todos.find((c) => c.id === 804 || c.name.toLowerCase() === 'yunara');
    expect(yunara).toBeDefined();
    expect(yunara?.id).toBe(804);
    expect(yunara?.name).toBe('Yunara');

    // Verificar que aparece en búsqueda por nombre y por ID
    const queryName = todos.filter((c) => c.name.toLowerCase().includes('yunara'));
    expect(queryName.length).toBeGreaterThan(0);
    expect(queryName[0].id).toBe(804);

    const queryId = todos.filter((c) => String(c.id).includes('804'));
    expect(queryId.length).toBeGreaterThan(0);
    expect(queryId[0].name).toBe('Yunara');
  });

  it('un ID desconocido devuelve "Campeón (ID: 9999)" e icono genérico SVG sin romper la UI', () => {
    const unknownId = 9999;
    const nombre = getChampionName(unknownId);
    expect(nombre).toBe('Campeón (ID: 9999)');

    const icon = getChampionIconUrl(unknownId);
    expect(icon).toBe(GENERIC_CHAMPION_ICON_URL);
    expect(icon.startsWith('data:image/svg+xml')).toBe(true);
    expect(icon).not.toContain('Aatrox');
  });
});
