/**
 * Catálogo canónico de hechizos de invocador en español.
 * Proporciona nombres, IDs numéricos oficiales e iconos Data Dragon.
 */

export interface SummonerSpellInfo {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly icon: string;
}

export const COMMON_SUMMONER_SPELLS: SummonerSpellInfo[] = [
  {
    id: 4,
    key: 'SummonerFlash',
    name: 'Destello (Flash)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerFlash.png',
  },
  {
    id: 12,
    key: 'SummonerTeleport',
    name: 'Teleportación (TP)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerTeleport.png',
  },
  {
    id: 14,
    key: 'SummonerDot',
    name: 'Ignición (Ignite)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerDot.png',
  },
  {
    id: 11,
    key: 'SummonerSmite',
    name: 'Aplastar (Smite)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerSmite.png',
  },
  {
    id: 7,
    key: 'SummonerHeal',
    name: 'Curación (Heal)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerHeal.png',
  },
  {
    id: 21,
    key: 'SummonerBarrier',
    name: 'Barrera (Barrier)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerBarrier.png',
  },
  {
    id: 3,
    key: 'SummonerExhaust',
    name: 'Extenuación (Exhaust)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerExhaust.png',
  },
  {
    id: 6,
    key: 'SummonerHaste',
    name: 'Fantasmal (Ghost)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerHaste.png',
  },
  {
    id: 1,
    key: 'SummonerBoost',
    name: 'Purificación (Cleanse)',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerBoost.png',
  },
];

const SPELLS_BY_ID = new Map<number, SummonerSpellInfo>(
  COMMON_SUMMONER_SPELLS.map((s) => [s.id, s])
);

export function getSummonerSpellById(id: number): SummonerSpellInfo | undefined {
  return SPELLS_BY_ID.get(id);
}

export function getSummonerSpellName(id: number, fallback = 'Hechizo'): string {
  const s = SPELLS_BY_ID.get(id);
  return s ? s.name : `${fallback} (${id})`;
}

export function getSummonerSpellIconUrl(id: number): string {
  const s = SPELLS_BY_ID.get(id);
  if (s) return s.icon;
  return 'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerFlash.png';
}
