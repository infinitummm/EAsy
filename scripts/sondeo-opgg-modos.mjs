/**
 * scripts/sondeo-opgg-modos.mjs
 * Script de Sondeo Fase 0: Sondear servidor MCP oficial de OP.GG (https://mcp-api.op.gg/mcp)
 * y comparar con la web oficial de OP.GG para ARAM Caos y Arena.
 */

const MCP_ENDPOINT = 'https://mcp-api.op.gg/mcp';

async function rpcCall(method, params = {}) {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

async function run() {
  console.log('===============================================================');
  console.log('       SONDEO FASE 0: OP.GG MCP & MODOS DE JUEGO (AUGMENTS)    ');
  console.log('===============================================================');

  console.log('\n--- 1. HERRAMIENTAS RELEVANTES EN MCP OFICIAL DE OP.GG ---');
  try {
    const listRes = await rpcCall('tools/list', {});
    const tools = listRes.result?.tools || [];
    for (const t of tools) {
      if (t.name.includes('augment') || t.name.includes('analysis') || t.name.includes('matchup')) {
        console.log(`• ${t.name}: ${t.description?.slice(0, 90)}...`);
      }
    }
  } catch (err) {
    console.error('Error al listar herramientas:', err.message);
  }

  console.log('\n--- 2. PROBANDO lol_list_aram_augments EN MCP (ARAM Caos / Mayhem) ---');
  try {
    const resAram = await rpcCall('tools/call', {
      name: 'lol_list_aram_augments',
      arguments: {
        champion_id: 266,
        lang: 'es_ES',
        desired_output_fields: [
          'champion_id',
          'data.augments[].id',
          'data.augments[].name',
          'data.augments[].tier',
          'data.augments[].performance',
          'data.augments[].popular',
        ],
      },
    });

    if (resAram.error) {
      console.log(`✗ Error: ${resAram.error.message}`);
    } else {
      const text = resAram.result?.content?.[0]?.text || '';
      console.log(`✓ ÉXITO MCP lol_list_aram_augments: obtenido payload de ${text.length} chars.`);
      console.log(`  Muestra: ${text.slice(0, 220)}...`);
    }
  } catch (e) {
    console.log(`✗ Excepción en lol_list_aram_augments: ${e.message}`);
  }

  console.log('\n--- 3. PROBANDO game_mode EN lol_get_champion_analysis ---');
  const candidates = ['ranked', 'flex', 'urf', 'aram', 'nexus_blitz', 'arena', 'aram_mayhem'];
  for (const mode of candidates) {
    process.stdout.write(`Probando mode '${mode}' con Aatrox... `);
    try {
      const res = await rpcCall('tools/call', {
        name: 'lol_get_champion_analysis',
        arguments: {
          game_mode: mode,
          champion: 'AATROX',
          position: mode === 'ranked' ? 'top' : 'none',
          tier: 'all',
          lang: 'en_US',
        },
      });

      if (res.error) {
        console.log(`✗ Error (${res.error.code}): ${res.error.message.slice(0, 75)}...`);
      } else {
        const text = res.result?.content?.[0]?.text || '';
        const tieneAugments = /augment|aumento/i.test(text);
        console.log(`✓ ÉXITO (${text.length} chars) - ¿Tiene Augments?: ${tieneAugments ? 'SÍ' : 'NO'}`);
      }
    } catch (err) {
      console.log(`✗ Excepción de red: ${err.message}`);
    }
  }

  console.log('\n--- 4. COMPARACIÓN CON OP.GG WEB / RSC (Plan B Verificado para Arena y Fallback) ---');
  const webUrls = [
    { modo: 'aram_mayhem', url: 'https://op.gg/lol/modes/aram-mayhem' },
    { modo: 'arena', url: 'https://op.gg/lol/modes/arena' },
  ];

  for (const w of webUrls) {
    process.stdout.write(`Consultando web ${w.url}... `);
    try {
      const resp = await fetch(w.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      });
      const html = await resp.text();
      console.log(`✓ OK (HTTP ${resp.status}, ${html.length} bytes con RSC payload).`);
    } catch (e) {
      console.log(`✗ Error: ${e.message}`);
    }
  }

  console.log('\nSondeo OP.GG Modos finalizado.');
}

run().catch(console.error);
