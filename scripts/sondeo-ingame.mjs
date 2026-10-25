/**
 * scripts/sondeo-ingame.mjs
 * Sondeo In-Game: Monitorea Live Client Data API (https://127.0.0.1:2999) y LCU WebSocket
 * para verificar la exposición de modo de juego, campeón activo y augments en partida real.
 */
import https from 'node:https';
import fs from 'node:fs';

const agent = new https.Agent({
  rejectUnauthorized: false,
});

async function checkLiveClientData() {
  const endpoints = [
    'https://127.0.0.1:2999/liveclientdata/allgamedata',
    'https://127.0.0.1:2999/liveclientdata/activeplayer',
    'https://127.0.0.1:2999/liveclientdata/playerlist',
    'https://127.0.0.1:2999/liveclientdata/eventdata',
    'https://127.0.0.1:2999/liveclientdata/gamestats',
  ];

  console.log('=== VERIFICANDO LIVE CLIENT DATA API (https://127.0.0.1:2999) ===');
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { agent });
      console.log(`Endpoint ${ep} -> Status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        const fname = `scratch/live_${ep.split('/').pop()}.json`;
        fs.writeFileSync(fname, JSON.stringify(json, null, 2));
        console.log(`  -> Guardado en ${fname}`);
      }
    } catch (e) {
      console.log(`Endpoint ${ep} -> No disponible (${e.message}) [Normal si LoL no está en partida activa]`);
    }
  }
}

async function main() {
  await checkLiveClientData();
}

main().catch(console.error);
