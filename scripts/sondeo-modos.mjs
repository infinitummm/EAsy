/**
 * Script de Sondeo Fase 0: Sondear OP.GG MCP y APIs públicas para ARAM Mayhem y Arena
 */
import fs from 'node:fs';

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
  console.log('=== 1. LISTANDO HERRAMIENTAS MCP DE OP.GG ===');
  try {
    const listRes = await rpcCall('tools/list', {});
    console.log('Herramientas encontradas:');
    if (listRes.result?.tools) {
      for (const t of listRes.result.tools) {
        console.log(`- ${t.name}: ${t.description?.slice(0, 100)}...`);
        console.log(`  Params schema:`, JSON.stringify(t.inputSchema?.properties || {}));
      }
    } else {
      console.log('Respuesta inesperada tools/list:', JSON.stringify(listRes));
    }
  } catch (err) {
    console.error('Error en tools/list:', err.message);
  }

  console.log('\n=== 2. PROBANDO game_mode EN lol_get_champion_analysis ===');
  const modes = ['ranked', 'aram', 'aram_mayhem', 'aram-mayhem', 'arena', 'cherry', 'URF', 'mayhem'];
  for (const mode of modes) {
    try {
      console.log(`\nProbando mode: '${mode}' con Aatrox...`);
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
        console.log(`  -> Error RPC: ${res.error.code} - ${res.error.message}`);
      } else {
        const text = res.result?.content?.[0]?.text || '';
        console.log(`  -> ÉXITO (${text.length} chars). Preview: ${text.slice(0, 200).replace(/\n/g, ' ')}`);
        if (text.includes('augment') || text.includes('Augment')) {
          console.log(`  -> ¡CONTIENE AUGMENTS!`);
        }
      }
    } catch (e) {
      console.log(`  -> Exception: ${e.message}`);
    }
  }

  console.log('\n=== 3. SONDEANDO ENDPOINTS WEB / API DE OP.GG PARA ARENA Y ARAM-MAYHEM ===');
  const webUrls = [
    'https://op.gg/lol/modes/aram-mayhem',
    'https://op.gg/lol/modes/arena',
    'https://lol-web-api.op.gg/api/v1.0/internal/bypass/modes/arena/augments',
    'https://lol-web-api.op.gg/api/v1.0/internal/bypass/modes/aram-mayhem/augments',
    'https://lol-web-api.op.gg/api/v1.0/internal/bypass/modes/arena/champions/Aatrox',
    'https://lol-web-api.op.gg/api/v1.0/internal/bypass/modes/aram-mayhem/champions/Aatrox',
  ];

  for (const url of webUrls) {
    try {
      console.log(`Consultando ${url}...`);
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
        },
      });
      console.log(`  -> Status: ${resp.status} ${resp.statusText}, Content-Type: ${resp.headers.get('content-type')}`);
      const text = await resp.text();
      console.log(`  -> Tamaño: ${text.length} bytes`);
      if (url.endsWith('.html') || (!url.includes('/api/') && resp.headers.get('content-type')?.includes('html'))) {
        // Buscar __NEXT_DATA__
        const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (match) {
          console.log(`  -> ¡Encontrado __NEXT_DATA__! Longitud: ${match[1].length}`);
          try {
            const nextData = JSON.parse(match[1]);
            const pagePropsKeys = Object.keys(nextData.props?.pageProps || {});
            console.log(`  -> PageProps keys:`, pagePropsKeys);
            // Guardar snippet para inspección
            fs.writeFileSync(`scratch/next_data_${url.split('/').pop()}.json`, JSON.stringify(nextData.props?.pageProps || {}, null, 2));
            console.log(`  -> Guardado scratch/next_data_${url.split('/').pop()}.json`);
          } catch (pe) {
            console.log(`  -> Error parseando nextData: ${pe.message}`);
          }
        }
      } else {
        console.log(`  -> Preview body: ${text.slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`  -> Error fetching ${url}: ${e.message}`);
    }
  }
}

run().catch(console.error);
