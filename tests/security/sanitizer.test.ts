import { describe, it, expect } from 'vitest';
import { sanitizarParaDiagnostico } from '../../src/main/ipc/settingsIpc';

describe('sanitizarParaDiagnostico - Redacción Estricta de Secretos y Rutas Personales', () => {
  it('redacta rutas absolutas con nombres de usuario de Windows y Unix', () => {
    const raw = 'Error en C:\\Users\\Administrator\\Documents\\ProyectoItero\\data.json o en /Users/carlos/itero';
    const clean = sanitizarParaDiagnostico(raw);
    expect(clean).not.toContain('Administrator');
    expect(clean).not.toContain('carlos');
    expect(clean).toContain('C:\\Users\\[USER]\\Documents\\ProyectoItero\\data.json');
    expect(clean).toContain('/Users/[USER]/itero');
  });

  it('redacta claves de Gemini (AIza...), Riot API (RGAPI-...) y GitHub Tokens (ghp_...)', () => {
    const raw = {
      geminiKey: 'AIzaSyD-1234567890abcdefghijklmnopqrstuv',
      riotKey: 'RGAPI-12345678-abcd-1234-abcd-123456789abc',
      githubToken: 'ghp_123456789012345678901234567890123456',
      authHeader: 'Basic dXNlcjpwYXNzd29yZA==',
      mensaje: 'Llamada fallida con RGAPI-12345678-abcd-1234-abcd-123456789abc en la URL',
    };

    const clean = sanitizarParaDiagnostico(raw);

    expect(clean.geminiKey).toBe('[REDACTED]');
    expect(clean.riotKey).toBe('[REDACTED]');
    expect(clean.githubToken).toBe('[REDACTED]');
    expect(clean.authHeader).toBe('[REDACTED]');
    expect(clean.mensaje).not.toContain('RGAPI-12345678-abcd-1234-abcd-123456789abc');
    expect(clean.mensaje).toContain('[REDACTED_RIOT_KEY]');
  });

  it('redacta PUUIDs y UUIDs sensibles', () => {
    const raw = 'PUUID detectado: fcbab84b-0d1b-5366-9fd0-8dc025207be4 en sesión';
    const clean = sanitizarParaDiagnostico(raw);
    expect(clean).not.toContain('fcbab84b-0d1b-5366-9fd0-8dc025207be4');
    expect(clean).toContain('[REDACTED_UUID]');
  });
});
