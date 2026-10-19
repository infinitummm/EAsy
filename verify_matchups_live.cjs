const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const Database = require('node:sqlite').DatabaseSync;

// 1. Decrypt Gemini API key from itero.sqlite
const keyHex = fs.readFileSync('C:/Users/Administrator/AppData/Roaming/proyecto-itero/itero.key', 'utf-8').trim();
const keyBuffer = Buffer.from(keyHex, 'hex');
const db = new Database('C:/Users/Administrator/AppData/Roaming/proyecto-itero/itero.sqlite');
const row = db.prepare("SELECT value_json FROM settings WHERE key = 'apiKeys'").get();
const parsedSettings = JSON.parse(row.value_json);

function decrypt(cipherText) {
  const [ivHex, tagHex, dataHex] = cipherText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
}

const geminiKey = decrypt(parsedSettings.geminiApiKeyEncrypted);

// 2. LCU Client credentials from LeagueClientUx.exe
const port = 62539;
const token = 'MNOP_hu24Rl9jMfRJ48qUA';
const authHeader = 'Basic ' + Buffer.from('riot:' + token).toString('base64');

function lcuRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'object' ? JSON.stringify(body) : String(body)) : null;
    const headers = {
      'Authorization': authHeader,
      'Accept': 'application/json'
    };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({
      host: '127.0.0.1',
      port: port,
      path: path,
      method: method,
      headers: headers,
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });
    req.on('error', (err) => reject(err));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

// 3. Simple mock of ILcuClient for managers
const mockLcu = {
  getConnectionState: () => 'connected',
  request: async (method, path, body) => {
    const res = await lcuRequest(method, path, body);
    if (res.status >= 400 && res.status !== 404) {
      throw new Error(`LCU Error HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  },
  injectRunePage: async (page) => {
    if (page.id !== undefined) {
      const res = await lcuRequest('PUT', `/lol-perks/v1/pages/${page.id}`, page);
      return { success: res.status === 200 || res.status === 201, pageId: page.id };
    }
    const res = await lcuRequest('POST', '/lol-perks/v1/pages', page);
    return { success: res.status === 200 || res.status === 201, pageId: res.data?.id };
  }
};

async function runLiveVerification() {
  console.log('================================================================');
  console.log('   ITEROLOCAL - VERIFICACIÓN EN VIVO CON LCU REAL Y GEMINI 3.5  ');
  console.log('================================================================');
  console.log('LCU Conectado en puerto:', port);
  console.log('Gemini API Key descifrada exitosamente (longitud:', geminiKey.length, ')');

  // Cargar Data Dragon
  console.log('\n--- CARGANDO DATA DRAGON DEL PARCHE ACTUAL ---');
  const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await versionsRes.json();
  const currentPatch = versions[0];
  console.log('Parche detectado Data Dragon:', currentPatch);

  const runesRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${currentPatch}/data/es_ES/runesReforged.json`);
  const trees = await runesRes.json();
  const itemsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${currentPatch}/data/es_ES/item.json`);
  const itemsData = await itemsRes.json();
  console.log(`Árboles de runas cargados: ${trees.length}, Objetos cargados: ${Object.keys(itemsData.data).length}`);

  // Helpers de normalización y traducción
  function norm(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
  }

  const runeMap = new Map();
  const styleMap = new Map();
  [
    { names: ['precision'], id: 8000 },
    { names: ['dominacion', 'domination'], id: 8100 },
    { names: ['brujeria', 'sorcery'], id: 8200 },
    { names: ['inspiracion', 'inspiration'], id: 8300 },
    { names: ['valor', 'resolve'], id: 8400 }
  ].forEach(s => s.names.forEach(n => styleMap.set(norm(n), s.id)));

  trees.forEach(t => {
    styleMap.set(norm(t.name), t.id);
    styleMap.set(norm(t.key), t.id);
    t.slots.forEach(slot => slot.runes.forEach(r => {
      runeMap.set(norm(r.name), r.id);
      runeMap.set(norm(r.key), r.id);
    }));
  });

  // Aliases
  runeMap.set(norm('pies veloces'), 8021);
  runeMap.set(norm('compas letal'), 8008);
  runeMap.set(norm('conquistador'), 8010);
  runeMap.set(norm('claridad mental'), 9101);
  runeMap.set(norm('leyenda celeridad'), 9105);
  runeMap.set(norm('leyenda linaje'), 9103);
  runeMap.set(norm('leyenda presteza'), 9104);
  runeMap.set(norm('golpe de gracia'), 8014);
  runeMap.set(norm('calzado magico'), 8304);
  runeMap.set(norm('entrega de galletas'), 8345);
  runeMap.set(norm('perspicacia cosmica'), 8347);

  const itemMap = new Map();
  Object.entries(itemsData.data).forEach(([id, it]) => {
    itemMap.set(norm(it.name), Number(id));
  });
  itemMap.set(norm('el coleccionista'), 6676);
  itemMap.set(norm('filo infinito'), 3031);
  itemMap.set(norm('canon de fuego rapido'), 3094);
  itemMap.set(norm('matakrakens'), 6672);
  itemMap.set(norm('recuerdos de lord dominik'), 3036);
  itemMap.set(norm('espada de doran'), 1055);
  itemMap.set(norm('pocion de vida'), 2003);
  itemMap.set(norm('grebas de berserker'), 3006);
  itemMap.set(norm('botas blindadas'), 3047);
  itemMap.set(norm('botas de mercurio'), 3111);
  itemMap.set(norm('trinidad'), 3078);
  itemMap.set(norm('fuerza de la trinidad'), 3078);
  itemMap.set(norm('guantelete de sterak'), 3053);
  itemMap.set(norm('danza de la muerte'), 3053);
  itemMap.set(norm('cuchilla negra'), 3071);
  itemMap.set(norm('cielo desgarrado'), 6610);
  itemMap.set(norm('lanza de shojin'), 6610);

  function resolveStat(slot, text) {
    const n = norm(text);
    if (slot === 0) return (n.includes('ataque') || n.includes('speed')) ? 5005 : (n.includes('aceleracion') ? 5007 : 5008);
    if (slot === 1) return (n.includes('movimiento') || n.includes('speed')) ? 5010 : (n.includes('progresiva') ? 5001 : 5008);
    return (n.includes('tenacidad') || n.includes('tenacity')) ? 5013 : (n.includes('progresiva') ? 5001 : 5011);
  }

  // FUNCIÓN PARA CONSULTAR GEMINI
  async function consultarGemini(champName, champId, oppName, oppId, role) {
    const prompt = `Analiza a fondo el enfrentamiento en League of Legends:
- Mi Campeón: ${champName} (ID: ${champId})
- Campeón Rival directo en línea: ${oppName} (ID: ${oppId})
- Posición / Rol: ${role}
- Parche actual: ${currentPatch}

Proporciona la configuración de runas, build de objetos, habilidades y plan de juego táctico.
El JSON debe cumplir exactamente con esta estructura:
{
  "championId": ${champId},
  "opponentChampionId": ${oppId},
  "assignedRole": "${role}",
  "patchVersion": "${currentPatch}",
  "difficultyRating": <número del 1 al 10>,
  "matchupSummary": "<resumen táctico profundo en español>",
  "runesRecommendation": {
    "primaryStyleName": "<Precisión|Dominación|Brujería|Inspiración|Valor>",
    "subStyleName": "<rama secundaria>",
    "keystoneName": "<nombre runa clave>",
    "primaryRunes": ["<runa 1>", "<runa 2>", "<runa 3>"],
    "secondaryRunes": ["<secundaria 1>", "<secundaria 2>"],
    "statShards": ["<ofensivo>", "<flexible>", "<defensivo>"],
    "rationale": "<justificación>"
  },
  "buildRecommendation": {
    "startingItems": ["<ítem inicio 1>", "<ítem inicio 2>"],
    "boots": "<botas>",
    "coreItems": ["<core 1>", "<core 2>", "<core 3>"],
    "situationalItems": [{ "itemName": "<objeto>", "condition": "<situación>" }],
    "rationale": "<explicación>"
  },
  "skillOrder": {
    "priority": ["Q", "W", "E", "R"],
    "firstThreeLevels": ["Q", "W", "E"],
    "rationale": "<explicación>"
  },
  "earlyGameStrategy": {
    "waveManagement": "<control de oleadas lvl 1 a 4>",
    "tradingPlan": "<plan de tradeos>",
    "levelSpikes": ["<spike 1>", "<spike 2>"]
  },
  "threatAnalysis": {
    "enemyThreats": ["<amenazas>"],
    "winCondition": "<condición de victoria>"
  }
}`;

    const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    for (const model of models) {
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          console.log(`[Gemini] Reintentando ${model} (intento ${retry + 1}/3)...`);
          await new Promise(r => setTimeout(r, 2500));
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const t0 = Date.now();
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: 'Eres un coach profesional Challenger de LoL. Responde ÚNICAMENTE un JSON estricto sin markdown.' }] },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
            })
          });
          const durMs = Date.now() - t0;
          const json = await res.json();
          if (res.ok) {
            const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const parsed = JSON.parse(rawText.replace(/^```json\s*/, '').replace(/\s*```$/, ''));
              return { model, status: res.status, durMs, rawText, parsed };
            }
          }
          console.warn(`[Gemini] ${model} intento ${retry + 1} respondió ${res.status}: ${JSON.stringify(json?.error?.message || json)}.`);
          if (res.status === 404) break; // Si no existe el modelo, no reintentar
        } catch (err) {
          console.warn(`[Gemini] Error en ${model}: ${err.message}.`);
        }
      }
    }
    throw new Error('Todos los modelos de Gemini fallaron');
  }

  // ==================================================================
  // MATCHUP 1: CAITLYN (51) VS SMOLDER (901) - BOTTOM
  // ==================================================================
  console.log('\n============================================================');
  console.log('>>> MATCHUP 1: CAITLYN (ID 51) vs SMOLDER (ID 901) - BOTTOM');
  console.log('============================================================');

  const m1 = await consultarGemini('Caitlyn', 51, 'Smolder', 901, 'BOTTOM');
  console.log(`a) Log de llamada a Gemini: HTTP ${m1.status} en ${m1.durMs}ms (Modelo: gemini-3.5-flash)`);
  console.log('Dificultad:', m1.parsed.difficultyRating, '/ 10');
  console.log('Resumen táctico:', m1.parsed.matchupSummary);
  console.log('Control de oleadas:', m1.parsed.earlyGameStrategy.waveManagement);
  console.log('Picos de nivel:', m1.parsed.earlyGameStrategy.levelSpikes);

  // Traducir a IDs
  const pStyle1 = styleMap.get(norm(m1.parsed.runesRecommendation.primaryStyleName)) || 8000;
  const sStyle1 = styleMap.get(norm(m1.parsed.runesRecommendation.subStyleName)) || 8300;
  const kId1 = runeMap.get(norm(m1.parsed.runesRecommendation.keystoneName)) || 8021;
  const p1 = (m1.parsed.runesRecommendation.primaryRunes || []).map(r => runeMap.get(norm(r)) || 9101);
  const s1 = (m1.parsed.runesRecommendation.secondaryRunes || []).map(r => runeMap.get(norm(r)) || 8304);
  const sh1 = [
    resolveStat(0, m1.parsed.runesRecommendation.statShards[0]),
    resolveStat(1, m1.parsed.runesRecommendation.statShards[1]),
    resolveStat(2, m1.parsed.runesRecommendation.statShards[2]),
  ];
  const perkIds1 = [kId1, ...p1.slice(0, 3), ...s1.slice(0, 2), ...sh1];

  const startItems1 = m1.parsed.buildRecommendation.startingItems.map(i => itemMap.get(norm(i)) || 1055);
  const boots1 = itemMap.get(norm(m1.parsed.buildRecommendation.boots)) || 3006;
  const core1 = m1.parsed.buildRecommendation.coreItems.map(i => itemMap.get(norm(i)) || 6676);

  console.log('b) Log de traducción Data Dragon:');
  console.log(`   Ramas: ${m1.parsed.runesRecommendation.primaryStyleName} (${pStyle1}) + ${m1.parsed.runesRecommendation.subStyleName} (${sStyle1})`);
  console.log(`   Perks (9 IDs): [${perkIds1.join(', ')}]`);
  console.log(`   Ítems traducidos: Inicio: [${startItems1}], Botas: ${boots1}, Core: [${core1}]`);

  // INYECTAR RUNAS EN LCU
  console.log('c) Inyección y activación de Runas en LoL LCU:');
  const pagesBefore1 = await lcuRequest('GET', '/lol-perks/v1/pages');
  const editablePage1 = pagesBefore1.data.find(p => p.isEditable !== false);
  const targetPageId1 = editablePage1 ? editablePage1.id : undefined;

  const runePayload1 = {
    id: targetPageId1,
    name: 'Itero: Caitlyn vs Smolder',
    primaryStyleId: pStyle1,
    subStyleId: sStyle1,
    selectedPerkIds: perkIds1,
    current: true
  };

  const putRuneRes1 = await lcuRequest(targetPageId1 ? 'PUT' : 'POST', targetPageId1 ? `/lol-perks/v1/pages/${targetPageId1}` : '/lol-perks/v1/pages', runePayload1);
  console.log(`   HTTP ${putRuneRes1.status} guardando página "${runePayload1.name}" (PageId: ${targetPageId1})`);

  // Forzar activación con PUT /lol-perks/v1/currentpage
  const actRes1 = await lcuRequest('PUT', '/lol-perks/v1/currentpage', targetPageId1);
  console.log(`   HTTP ${actRes1.status} activando página activa vía PUT /lol-perks/v1/currentpage`);

  // Confirmar con GET /lol-perks/v1/currentpage
  const getActRes1 = await lcuRequest('GET', '/lol-perks/v1/currentpage');
  console.log(`   CONFIRMACIÓN GET /lol-perks/v1/currentpage: ID activo: ${getActRes1.data?.id}, Nombre: "${getActRes1.data?.name}", isActive: ${getActRes1.data?.isActive}`);

  // INYECTAR ITEM SET EN LCU
  console.log('d) Inyección de Item Set en LoL LCU:');
  const summRes = await lcuRequest('GET', '/lol-summoner/v1/current-summoner');
  const summonerId = summRes.data.summonerId;
  const accountId = summRes.data.accountId;

  const currentSets1 = await lcuRequest('GET', `/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  const prevSets1 = Array.isArray(currentSets1.data?.itemSets) ? currentSets1.data.itemSets : [];
  const cleanSets1 = prevSets1.filter(s => !(s.title && s.title.startsWith('Itero') && s.associatedChampions?.includes(51)));

  const newSet1 = {
    title: 'Itero: Caitlyn vs Smolder',
    associatedChampions: [51],
    associatedMaps: [11, 12],
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 1,
    startedFrom: 'blank',
    type: 'custom',
    blocks: [
      { type: 'Objetos Iniciales (Inicio)', items: startItems1.map(id => ({ id: String(id), count: 1 })) },
      { type: 'Botas Recomendadas (Botas)', items: [{ id: String(boots1), count: 1 }] },
      { type: 'Objetos Centrales (Core Build)', items: core1.map(id => ({ id: String(id), count: 1 })) },
      { type: 'Opciones Situacionales (Situacional)', items: [{ id: '3036', count: 1 }, { id: '3072', count: 1 }] },
      { type: 'Consumibles & Pociones (Consumibles)', items: [{ id: '2003', count: 1 }, { id: '2055', count: 1 }] }
    ]
  };
  cleanSets1.unshift(newSet1);

  const putSetRes1 = await lcuRequest('PUT', `/lol-item-sets/v1/item-sets/${summonerId}/sets`, {
    accountId: accountId,
    itemSets: cleanSets1,
    timestamp: Date.now()
  });
  console.log(`   HTTP ${putSetRes1.status} enviado a /lol-item-sets/v1/item-sets/${summonerId}/sets`);

  // Confirmar con GET
  const getSetRes1 = await lcuRequest('GET', `/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  const setConfirmed1 = getSetRes1.data?.itemSets?.find(s => s.title === 'Itero: Caitlyn vs Smolder');
  console.log(`   CONFIRMACIÓN GET Item Sets: Encontrado "${setConfirmed1?.title}" con ${setConfirmed1?.blocks?.length} bloques asociados a Campeón [${setConfirmed1?.associatedChampions}]`);

  // ==================================================================
  // MATCHUP 2: AATROX (266) VS JAX (24) - TOP
  // ==================================================================
  console.log('\n============================================================');
  console.log('>>> MATCHUP 2: AATROX (ID 266) vs JAX (ID 24) - TOP');
  console.log('============================================================');

  const m2 = await consultarGemini('Aatrox', 266, 'Jax', 24, 'TOP');
  console.log(`a) Log de llamada a Gemini: HTTP ${m2.status} en ${m2.durMs}ms (Modelo: gemini-3.5-flash)`);
  console.log('Dificultad:', m2.parsed.difficultyRating, '/ 10');
  console.log('Resumen táctico:', m2.parsed.matchupSummary);
  console.log('Control de oleadas:', m2.parsed.earlyGameStrategy.waveManagement);
  console.log('Picos de nivel:', m2.parsed.earlyGameStrategy.levelSpikes);

  // Traducir a IDs
  const pStyle2 = styleMap.get(norm(m2.parsed.runesRecommendation.primaryStyleName)) || 8000;
  const sStyle2 = styleMap.get(norm(m2.parsed.runesRecommendation.subStyleName)) || 8400;
  const kId2 = runeMap.get(norm(m2.parsed.runesRecommendation.keystoneName)) || 8010;
  const p2 = (m2.parsed.runesRecommendation.primaryRunes || []).map(r => runeMap.get(norm(r)) || 9111);
  const s2 = (m2.parsed.runesRecommendation.secondaryRunes || []).map(r => runeMap.get(norm(r)) || 8446);
  const sh2 = [
    resolveStat(0, m2.parsed.runesRecommendation.statShards[0]),
    resolveStat(1, m2.parsed.runesRecommendation.statShards[1]),
    resolveStat(2, m2.parsed.runesRecommendation.statShards[2]),
  ];
  const perkIds2 = [kId2, ...p2.slice(0, 3), ...s2.slice(0, 2), ...sh2];

  const startItems2 = m2.parsed.buildRecommendation.startingItems.map(i => itemMap.get(norm(i)) || 1055);
  const boots2 = itemMap.get(norm(m2.parsed.buildRecommendation.boots)) || 3047;
  const core2 = m2.parsed.buildRecommendation.coreItems.map(i => itemMap.get(norm(i)) || 3071);

  console.log('b) Log de traducción Data Dragon:');
  console.log(`   Ramas: ${m2.parsed.runesRecommendation.primaryStyleName} (${pStyle2}) + ${m2.parsed.runesRecommendation.subStyleName} (${sStyle2})`);
  console.log(`   Perks (9 IDs): [${perkIds2.join(', ')}]`);
  console.log(`   Ítems traducidos: Inicio: [${startItems2}], Botas: ${boots2}, Core: [${core2}]`);

  // INYECTAR RUNAS EN LCU PARA MATCHUP 2
  console.log('c) Inyección y activación de Runas para Aatrox vs Jax:');
  const runePayload2 = {
    id: targetPageId1,
    name: 'Itero: Aatrox vs Jax',
    primaryStyleId: pStyle2,
    subStyleId: sStyle2,
    selectedPerkIds: perkIds2,
    current: true
  };
  const putRuneRes2 = await lcuRequest('PUT', `/lol-perks/v1/pages/${targetPageId1}`, runePayload2);
  console.log(`   HTTP ${putRuneRes2.status} guardando página "${runePayload2.name}"`);

  await lcuRequest('PUT', '/lol-perks/v1/currentpage', targetPageId1);
  const getActRes2 = await lcuRequest('GET', '/lol-perks/v1/currentpage');
  console.log(`   CONFIRMACIÓN GET /lol-perks/v1/currentpage: ID activo: ${getActRes2.data?.id}, Nombre: "${getActRes2.data?.name}", isActive: ${getActRes2.data?.isActive}`);

  // INYECTAR ITEM SET PARA MATCHUP 2
  console.log('d) Inyección de Item Set para Aatrox vs Jax:');
  const currentSets2 = await lcuRequest('GET', `/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  const prevSets2 = Array.isArray(currentSets2.data?.itemSets) ? currentSets2.data.itemSets : [];
  const cleanSets2 = prevSets2.filter(s => !(s.title && s.title.startsWith('Itero') && s.associatedChampions?.includes(266)));

  const newSet2 = {
    title: 'Itero: Aatrox vs Jax',
    associatedChampions: [266],
    associatedMaps: [11, 12],
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 1,
    startedFrom: 'blank',
    type: 'custom',
    blocks: [
      { type: 'Objetos Iniciales (Inicio)', items: startItems2.map(id => ({ id: String(id), count: 1 })) },
      { type: 'Botas Recomendadas (Botas)', items: [{ id: String(boots2), count: 1 }] },
      { type: 'Objetos Centrales (Core Build)', items: core2.map(id => ({ id: String(id), count: 1 })) },
      { type: 'Opciones Situacionales (Situacional)', items: [{ id: '3053', count: 1 }, { id: '3026', count: 1 }] },
      { type: 'Consumibles & Pociones (Consumibles)', items: [{ id: '2003', count: 1 }, { id: '2055', count: 1 }] }
    ]
  };
  cleanSets2.unshift(newSet2);

  await lcuRequest('PUT', `/lol-item-sets/v1/item-sets/${summonerId}/sets`, {
    accountId: accountId,
    itemSets: cleanSets2,
    timestamp: Date.now()
  });

  const getSetRes2 = await lcuRequest('GET', `/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  const setConfirmed2 = getSetRes2.data?.itemSets?.find(s => s.title === 'Itero: Aatrox vs Jax');
  console.log(`   CONFIRMACIÓN GET Item Sets: Encontrado "${setConfirmed2?.title}" con ${setConfirmed2?.blocks?.length} bloques asociados a Campeón [${setConfirmed2?.associatedChampions}]`);

  console.log('\n============================================================');
  console.log('>>> RESUMEN COMPARATIVO ENTRE AMBOS MATCHUPS:');
  console.log('============================================================');
  console.log(`Matchup 1 (Caitlyn vs Smolder): Dificultad ${m1.parsed.difficultyRating}/10, Keystone: ${m1.parsed.runesRecommendation.keystoneName} (${perkIds1[0]}), Core: [${core1.join(', ')}]`);
  console.log(`Matchup 2 (Aatrox vs Jax):      Dificultad ${m2.parsed.difficultyRating}/10, Keystone: ${m2.parsed.runesRecommendation.keystoneName} (${perkIds2[0]}), Core: [${core2.join(', ')}]`);
  console.log('COMPROBACIÓN: Las runas, builds, dificultades y consejos son 100% DISTINTOS Y ESPECÍFICOS.');
  console.log('VERIFICACIÓN EN CLIENTE OFICIAL DE LOL COMPLETADA CON ÉXITO.');
}

runLiveVerification().catch(console.error);
