import React, { useState, useEffect } from 'react';
import { AccountEntity } from '../../shared/contracts';
import { ParsedMatchSummary, PlatformRouting, RegionalRouting, AppSettings } from '../../shared/types';

interface ProfileViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
  patchVersion?: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  settings,
  onSaveSettings,
  patchVersion = '14.20.1'
}) => {
  const [account, setAccount] = useState<AccountEntity | null>(null);
  const [matches, setMatches] = useState<ParsedMatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario de sincronización
  const [gameName, setGameName] = useState(settings.activeAccount?.gameName || 'IteroPlayer');
  const [tagLine, setTagLine] = useState(settings.activeAccount?.tagLine || 'LAN');
  const [platform, setPlatform] = useState<PlatformRouting>(settings.activeAccount?.platform || 'la1');
  const [regional, setRegional] = useState<RegionalRouting>(settings.activeAccount?.regional || 'americas');

  useEffect(() => {
    loadProfile();
  }, [settings.activeAccount]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      if (window.api && window.api.getProfile) {
        const puuid = settings.activeAccount?.puuid || '';
        const res = await window.api.getProfile(puuid);
        setAccount(res.account);
        setMatches(res.matches);
      } else {
        // Fallback para preview
        setAccount({
          puuid: 'preview-puuid',
          gameName: settings.activeAccount?.gameName || 'IteroPlayer',
          tagLine: settings.activeAccount?.tagLine || 'LAN',
          platform: 'la1',
          regional: 'americas',
          profileIconId: 588,
          summonerLevel: 184,
          tier: 'EMERALD',
          rank: 'II',
          leaguePoints: 68,
          updatedAt: Date.now()
        });
        setMatches([
          {
            matchId: 'LA1_1001',
            puuid: 'preview-puuid',
            gameCreation: Date.now() - 3600000,
            gameDuration: 1840,
            gameVersion: patchVersion,
            queueId: 420,
            championId: 266,
            championName: 'Aatrox',
            role: 'TOP',
            win: true,
            kills: 9,
            deaths: 2,
            assists: 7,
            kda: 8.0,
            cs: 224,
            csPerMinute: 7.3,
            goldEarned: 14500,
            damageDealt: 26800,
            items: [3078, 6631, 3053],
            primaryStyleId: 8000,
            subStyleId: 8400,
            selectedPerks: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002]
          },
          {
            matchId: 'LA1_1002',
            puuid: 'preview-puuid',
            gameCreation: Date.now() - 7200000,
            gameDuration: 1650,
            gameVersion: patchVersion,
            queueId: 420,
            championId: 24,
            championName: 'Jax',
            role: 'TOP',
            win: false,
            kills: 3,
            deaths: 5,
            assists: 2,
            kda: 1.0,
            cs: 170,
            csPerMinute: 6.1,
            goldEarned: 9800,
            damageDealt: 13400,
            items: [3078],
            primaryStyleId: 8000,
            subStyleId: 8300,
            selectedPerks: [8005, 9111, 9104, 8014, 8304, 8345, 5008, 5008, 5002]
          }
        ]);
      }
    } catch {
      // Ignorar
    } finally {
      setLoading(false);
    }
  };

  const PLATFORM_ROUTING_MAP: Record<PlatformRouting, RegionalRouting> = {
  la1: 'americas',
  la2: 'americas',
  na1: 'americas',
  br1: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  kr: 'asia',
  jp1: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      let cleanName = gameName.trim();
      let cleanTag = tagLine.replace(/#/g, '').trim();

      if (cleanName.includes('#')) {
        const parts = cleanName.split('#');
        cleanName = parts[0].trim();
        if (!cleanTag && parts[1]) {
          cleanTag = parts[1].replace(/#/g, '').trim();
        }
      }

      setGameName(cleanName);
      setTagLine(cleanTag);

      const derivedRegional = PLATFORM_ROUTING_MAP[platform] || regional;

      if (window.api && window.api.syncAccount) {
        const res = await window.api.syncAccount({
          gameName: cleanName,
          tagLine: cleanTag,
          platform,
          regional: derivedRegional
        });

        if (res.success) {
          setSyncMessage({ type: 'success', text: `¡Cuenta ${cleanName}#${cleanTag} sincronizada exitosamente!` });
          onSaveSettings({
            activeAccount: {
              puuid: account?.puuid || '',
              gameName: cleanName,
              tagLine: cleanTag,
              platform,
              regional: derivedRegional
            }
          });
          await loadProfile();
        } else {
          setSyncMessage({
            type: 'error',
            text: res.error || 'No se pudo sincronizar la cuenta. Verifica que tu Riot API Key esté vigente.'
          });
        }
      } else {
        setSyncMessage({ type: 'success', text: 'Cuenta actualizada en modo local.' });
      }
    } catch (err: unknown) {
      setSyncMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setSyncing(false);
    }
  };

  // Cálculos estadísticos
  const totalMatches = matches.length;
  const wins = matches.filter((m) => m.win).length;
  const winrate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  const avgKda =
    totalMatches > 0
      ? (matches.reduce((acc, m) => acc + m.kda, 0) / totalMatches).toFixed(2)
      : '0.00';
  const avgCsMin =
    totalMatches > 0
      ? (matches.reduce((acc, m) => acc + m.csPerMinute, 0) / totalMatches).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* Tarjeta Principal de Perfil */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/profileicon/${
                  account?.profileIconId || 588
                }.png`}
                alt="Icono de Invocador"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                className="w-16 h-16 rounded-2xl border-2 border-indigo-500 bg-neutral-950 object-cover shadow-md"
              />
              <span className="absolute -bottom-2 -right-1 bg-neutral-900 border border-neutral-700 text-[10px] font-bold text-neutral-200 px-1.5 py-0.5 rounded-full">
                Lvl {account?.summonerLevel || 1}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
                <span>{account?.gameName || gameName}</span>
                <span className="text-neutral-500 font-semibold">#{account?.tagLine || tagLine}</span>
              </h2>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs bg-indigo-950/70 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded font-mono uppercase">
                  {account?.platform || platform}
                </span>
                <span className="text-xs text-neutral-400">
                  {account?.regional || regional}
                </span>
              </div>
            </div>
          </div>

          {/* Rango Clasificatorio */}
          <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800 flex items-center space-x-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
              🏆
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 uppercase font-semibold block">
                Clasificatoria Solo / Dúo
              </span>
              <div className="text-sm font-black text-white flex items-center space-x-1.5">
                <span>{account?.tier || 'UNRANKED'}</span>
                <span>{account?.rank || ''}</span>
                {account?.tier && account.tier !== 'UNRANKED' && (
                  <span className="text-xs text-amber-400 font-normal">
                    ({account.leaguePoints} LP)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas Clave */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-neutral-800">
          <div className="bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/80">
            <span className="text-[11px] text-neutral-400 block">Partidas Registradas</span>
            <span className="text-lg font-bold text-white">{totalMatches}</span>
          </div>

          <div className="bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/80">
            <span className="text-[11px] text-neutral-400 block">Porcentaje de Victoria</span>
            <span className={`text-lg font-bold ${winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {winrate}%
            </span>
          </div>

          <div className="bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/80">
            <span className="text-[11px] text-neutral-400 block">KDA Promedio</span>
            <span className="text-lg font-bold text-amber-400">{avgKda}</span>
          </div>

          <div className="bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/80">
            <span className="text-[11px] text-neutral-400 block">Súbditos / Min</span>
            <span className="text-lg font-bold text-cyan-400">{avgCsMin}</span>
          </div>
        </div>
      </div>

      {/* Sincronización con Riot API */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Sincronizar Datos con Riot Games</span>
        </h3>
        <p className="text-xs text-neutral-400 mb-4">
          Descarga automáticamente tus estadísticas clasificatorias, maestría de campeones e historial reciente usando tu API Key oficial.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-[11px] text-neutral-400 block mb-1">Riot ID o Nombre (ej: Infi o Infi#1505)</label>
            <input
              type="text"
              value={gameName}
              placeholder="Infi o Infi#1505"
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('#')) {
                  const parts = val.split('#');
                  setGameName(parts[0].trim());
                  if (parts[1] !== undefined) {
                    setTagLine(parts[1].replace(/#/g, '').trim());
                  }
                } else {
                  setGameName(val);
                }
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 block mb-1">Tag Line (sin #)</label>
            <input
              type="text"
              value={tagLine}
              placeholder="1505"
              onChange={(e) => setTagLine(e.target.value.replace(/#/g, '').trim())}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 block mb-1">Plataforma</label>
            <select
              value={platform}
              onChange={(e) => {
                const p = e.target.value as PlatformRouting;
                setPlatform(p);
                setRegional(PLATFORM_ROUTING_MAP[p] || 'americas');
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="la1">LAN (la1) → Americas</option>
              <option value="la2">LAS (la2) → Americas</option>
              <option value="na1">NA (na1) → Americas</option>
              <option value="br1">BR (br1) → Americas</option>
              <option value="euw1">EUW (euw1) → Europe</option>
              <option value="eun1">EUN (eun1) → Europe</option>
              <option value="kr">KR (kr) → Asia</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-neutral-400 block mb-1">Enrutamiento Regional (Auto)</label>
            <input
              type="text"
              readOnly
              value={PLATFORM_ROUTING_MAP[platform] || regional}
              className="w-full bg-neutral-950/60 border border-neutral-800/60 rounded-lg px-3 py-2 text-xs text-cyan-400 font-mono cursor-not-allowed"
            />
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg shadow-md transition-all flex items-center space-x-2"
        >
          {syncing ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Sincronizando con Riot API...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Sincronizar Historial y Rango</span>
            </>
          )}
        </button>

        {syncMessage && (
          <div
            className={`mt-3 p-3 rounded-lg text-xs font-medium ${
              syncMessage.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-800 text-rose-300'
            }`}
          >
            {syncMessage.text}
          </div>
        )}
      </div>

      {/* Partidas Recientes */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          <span>Historial de Partidas Recientes</span>
        </h3>

        {matches.length > 0 ? (
          <div className="space-y-2.5">
            {matches.map((m) => (
              <div
                key={m.matchId}
                className={`p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                  m.win
                    ? 'bg-emerald-950/20 border-emerald-800/40'
                    : 'bg-rose-950/20 border-rose-800/40'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`w-2 h-10 rounded-full ${
                      m.win ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  ></span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        {m.championName} (ID {m.championId})
                      </span>
                      <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.2 rounded font-mono">
                        {m.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400">
                      {m.win ? 'Victoria' : 'Derrota'} • {Math.floor(m.gameDuration / 60)} min
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-6 text-xs font-mono">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">KDA</span>
                    <span className="text-white font-bold">
                      {m.kills}/{m.deaths}/{m.assists} ({m.kda} KDA)
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px]">CS</span>
                    <span className="text-cyan-300">
                      {m.cs} ({m.csPerMinute}/m)
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px]">Oro</span>
                    <span className="text-amber-400">
                      {m.goldEarned.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400 text-center py-6">
            No hay partidas almacenadas aún en la base de datos local SQLite. Pulsa sincronizar para descargar tu historial.
          </p>
        )}
      </div>
    </div>
  );
};
