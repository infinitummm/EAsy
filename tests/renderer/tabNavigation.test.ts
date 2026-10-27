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

  describe('Cálculos estadísticos de Perfil con datos incompletos o nulos', () => {
    it('calcula métricas seguras cuando matches es null o vacío', () => {
      const calcularMetricas = (matches: any) => {
        const safeMatches = Array.isArray(matches) ? matches : [];
        const totalMatches = safeMatches.length;
        const wins = safeMatches.filter((m) => m?.win).length;
        const winrate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
        const avgKda =
          totalMatches > 0
            ? (safeMatches.reduce((acc, m) => acc + (m?.kda || 0), 0) / totalMatches).toFixed(2)
            : '0.00';
        const avgCsMin =
          totalMatches > 0
            ? (safeMatches.reduce((acc, m) => acc + (m?.csPerMinute || 0), 0) / totalMatches).toFixed(1)
            : '0.0';
        return { totalMatches, wins, winrate, avgKda, avgCsMin };
      };

      expect(calcularMetricas(null)).toEqual({ totalMatches: 0, wins: 0, winrate: 0, avgKda: '0.00', avgCsMin: '0.0' });
      expect(calcularMetricas(undefined)).toEqual({ totalMatches: 0, wins: 0, winrate: 0, avgKda: '0.00', avgCsMin: '0.0' });
      expect(calcularMetricas([])).toEqual({ totalMatches: 0, wins: 0, winrate: 0, avgKda: '0.00', avgCsMin: '0.0' });
      expect(calcularMetricas([{ win: true, kda: 3.5, csPerMinute: 7.2 }])).toEqual({
        totalMatches: 1,
        wins: 1,
        winrate: 100,
        avgKda: '3.50',
        avgCsMin: '7.2'
      });
    });
  });
});
