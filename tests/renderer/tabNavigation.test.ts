import { describe, it, expect } from 'vitest';
import { mergeSettings } from '../../src/renderer/App';
import { DEFAULT_APP_SETTINGS } from '../../src/shared/constants';
import { ErrorBoundary } from '../../src/renderer/components/ErrorBoundary';

describe('Resiliencia de Navegación y Prevención de Pantalla Azul', () => {
  describe('mergeSettings - Integridad de Propiedades Requeridas por las Vistas', () => {
    it('fusiona un objeto vacío preservando todas las claves de apiKeys y autoChampSelect', () => {
      const merged = mergeSettings({});
      expect(merged.apiKeys).toBeDefined();
      expect(merged.apiKeys.riotApiKeyEncrypted).toBe('');
      expect(merged.apiKeys.geminiApiKeyEncrypted).toBe('');

      expect(merged.autoChampSelect).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.TOP).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.JUNGLE).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.MIDDLE).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.BOTTOM).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.UTILITY).toBeDefined();
      expect(merged.autoChampSelect.rolePreferences.FILL).toBeDefined();
    });

    it('fusiona el objeto reducido retornado por Rust sin romper las vistas', () => {
      const rustSettings = {
        leaguePath: 'C:\\Riot Games\\LoL',
        autoAccept: { enabled: true, delaySeconds: 3 },
        aiProvider: 'gemini',
        geminiApiKey: 'test-key',
        overlayEnabled: true,
      };

      const merged = mergeSettings(rustSettings);
      expect(merged.autoAccept.delaySeconds).toBe(3);
      expect(merged.apiKeys).toBeDefined();
      expect(merged.apiKeys.riotApiKeyEncrypted).toBe('');
      expect(merged.autoChampSelect.rolePreferences.MIDDLE).toBeDefined();
      expect(merged.opggTier).toBe('emerald_plus');
    });

    it('maneja valores null o undefined devolviendo DEFAULT_APP_SETTINGS intacto', () => {
      expect(mergeSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
      expect(mergeSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
      expect(mergeSettings('invalido' as any)).toEqual(DEFAULT_APP_SETTINGS);
    });
  });

  describe('ErrorBoundary Component', () => {
    it('ErrorBoundary exporta una clase de componente con getDerivedStateFromError', () => {
      expect(ErrorBoundary).toBeDefined();
      const derivedState = ErrorBoundary.getDerivedStateFromError(new Error('Fallo de prueba'));
      expect(derivedState.hasError).toBe(true);
      expect(derivedState.error?.message).toBe('Fallo de prueba');
    });
  });
});
