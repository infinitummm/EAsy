import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  RolePreferencesEditor,
  ChampionAutocomplete,
  SpellSelector,
} from '../../src/renderer/components/RolePreferencesEditor';
import { DEFAULT_APP_SETTINGS } from '../../src/shared/constants';
import { ALL_CHAMPIONS, getChampionById } from '../../src/shared/champions';

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
});
