import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { LCU_CONSTANTS, RIOT_RATE_LIMITS, DEFAULT_APP_SETTINGS } from '../src/shared/constants';
import { IPC_CHANNELS } from '../src/shared/events';

describe('Suite de Verificación y Humo (T-2.1 Scaffold)', () => {
  it('debe cargar correctamente las constantes compartidas', () => {
    expect(LCU_CONSTANTS.DEFAULT_AUTO_ACCEPT_DELAY_SECONDS).toBe(2);
    expect(RIOT_RATE_LIMITS.SHORT_WINDOW_MAX_REQUESTS).toBe(20);
    expect(DEFAULT_APP_SETTINGS.autoAccept.enabled).toBe(true);
    expect(IPC_CHANNELS.LCU_STATE_CHANGED).toBe('lcu:state-changed');
  });

  it('debe operar con SQLite en memoria usando el módulo nativo node:sqlite', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE smoke_test (id INTEGER PRIMARY KEY, item TEXT);');
    db.exec("INSERT INTO smoke_test (item) VALUES ('itero-ok');");

    const stmt = db.prepare('SELECT item FROM smoke_test WHERE id = 1;');
    const result = stmt.get() as { item: string };
    expect(result).toBeDefined();
    expect(result.item).toBe('itero-ok');
    db.close();
  });
});
