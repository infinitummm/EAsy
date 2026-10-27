import React, { useState, useEffect } from 'react';
import { AccountEntity } from '../../shared/contracts';
import { ParsedMatchSummary, PlatformRouting, RegionalRouting, AppSettings } from '../../shared/types';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

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
  const [showAdvancedRiotApi, setShowAdvancedRiotApi] = useState(false);

  // Formulario de sincronización
  const [gameName, setGameName] = useState(settings.activeAccount?.gameName || 'Invocador');
  const [tagLine, setTagLine] = useState(settings.activeAccount?.tagLine || 'LAN');
  const [platform, setPlatform] = useState<PlatformRouting>(settings.activeAccount?.platform || 'la1');
  const [regional, setRegional] = useState<RegionalRouting>(settings.activeAccount?.regional || 'americas');

  useEffect(() => {
    loadProfile();
  }, [settings.activeAccount]);

  const handleSyncLocalAccount = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      if (window.api && window.api.syncLocalAccount) {
        const res = await window.api.syncLocalAccount();
        if (res.success && res.account) {
          setSyncMessage({
            type: 'success',
            text: `Cuenta ${res.account.gameName}#${res.account.tagLine} sincronizada.`
          });
          onSaveSettings({
            activeAccount: {
              puuid: res.account.puuid,
              gameName: res.account.gameName,
              tagLine: res.account.tagLine,
              platform: res.account.platform,
              regional: res.account.regional,
            }
          });
          await loadProfile();
        } else {
          setSyncMessage({
            type: 'error',
            text: res.error || 'Asegúrate de que League of Legends esté abierto con tu sesión iniciada.'
          });
        }
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

  const loadProfile = async () => {
    setLoading(true);
    try {
      if (window.api && window.api.getProfile) {
        const puuid = settings.activeAccount?.puuid || '';
        const res = await window.api.getProfile(puuid);
        if (res) {
          setAccount(res.account || null);
          setMatches(Array.isArray(res.matches) ? res.matches : []);
        }
      } else {
        // Fallback para preview
        setAccount({
          puuid: 'preview-puuid',
          gameName: settings.activeAccount?.gameName || 'Invocador',
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

  return (
    <div className="space-y-6 select-none">
      {/* Tarjeta Principal de Perfil // Estilo P3R Status */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-6 p3r-bevel p3r-shadow-hard relative">
        <div className="flex items-center space-x-2 mb-4">
          <span className="px-2.5 py-0.5 bg-[#0066FF] text-white text-[10px] font-black tracking-widest uppercase transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
            <span className="transform skew-x-8 inline-block">PERFIL</span>
          </span>
          <P3rBadge label="ESTADO EN VIVO" variant="cyan" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            <div className="relative">
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/profileicon/${
                  account?.profileIconId || 588
                }.png`}
                alt="Icono de Invocador"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                className="w-18 h-18 border-2 border-[#0066FF] bg-[#030814] object-cover p3r-shadow-blue p3r-cut-tr"
              />
              <span className="absolute -bottom-2 -right-1 bg-[#0066FF] text-white text-[10px] font-black px-2 py-0.5 transform -skew-x-8 font-mono border-l border-white">
                <span className="transform skew-x-8 inline-block">LVL {account?.summonerLevel || 1}</span>
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white flex items-center space-x-2 font-p3r uppercase tracking-wider">
                <span>{account?.gameName || gameName}</span>
                <span className="text-[#00E5FF] font-mono text-lg font-bold">#{account?.tagLine || tagLine}</span>
              </h2>

              <div className="flex flex-wrap items-center gap-3 mt-2">
                <P3rButton
                  variant="cyan"
                  size="sm"
                  onClick={handleSyncLocalAccount}
                  disabled={syncing}
                >
                  {syncing ? 'Sincronizando...' : 'Sincronizar desde Cliente LoL'}
                </P3rButton>

                <div className="flex items-center space-x-2 font-mono text-xs">
                  <span className="bg-[#030814] border border-[#16335F] text-[#00E5FF] px-2 py-0.5 uppercase font-bold">
                    {account?.platform || platform}
                  </span>
                  <span className="text-[#7E9BB8]">
                    {account?.regional || regional}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Rango Clasificatorio P3R */}
          <div className="bg-[#030814] p-4 border border-[#16335F] flex items-center space-x-4 p3r-cut-tr p3r-shadow-hard">
            <div className="w-12 h-12 bg-[#0066FF] text-white flex items-center justify-center font-black text-base transform -skew-x-8 p3r-shadow-blue border-l-2 border-white">
              <span className="transform skew-x-8 font-p3r">RANK</span>
            </div>
            <div>
              <span className="text-[10px] text-[#7E9BB8] uppercase font-black tracking-wider block font-p3r-head">
                Clasificatoria Solo / Dúo
              </span>
              <div className="text-base font-black text-white flex items-center space-x-1.5 font-p3r uppercase tracking-wider">
                <span className="text-[#00E5FF]">{account?.tier || 'UNRANKED'}</span>
                <span>{account?.rank || ''}</span>
                {account?.tier && account.tier !== 'UNRANKED' && (
                  <span className="text-xs text-[#FFE277] font-normal font-mono">
                    ({account.leaguePoints} LP)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas Clave */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t-2 border-[#16335F] font-mono">
          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] uppercase font-black block font-p3r-head">Partidas Registradas</span>
            <span className="text-xl font-black text-white mt-0.5 block">{totalMatches}</span>
          </div>

          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] uppercase font-black block font-p3r-head">Porcentaje de Victoria</span>
            <span className={`text-xl font-black mt-0.5 block ${winrate >= 50 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
              {winrate}%
            </span>
          </div>

          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] uppercase font-black block font-p3r-head">KDA Promedio</span>
            <span className="text-xl font-black text-[#FFE277] mt-0.5 block">{avgKda}</span>
          </div>

          <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
            <span className="text-[10px] text-[#7E9BB8] uppercase font-black block font-p3r-head">Súbditos / Min</span>
            <span className="text-xl font-black text-[#00E5FF] mt-0.5 block">{avgCsMin}</span>
          </div>
        </div>
      </div>

      {/* Sincronización Avanzada con Riot API (Opcional) */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard">
        <button
          type="button"
          onClick={() => setShowAdvancedRiotApi(!showAdvancedRiotApi)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2 font-p3r">
              <span className="w-2.5 h-2.5 bg-[#0066FF] transform rotate-45"></span>
              <span>Avanzado: Búsqueda Remota con Riot Games API (Opcional)</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mt-0.5">
              Solo requerido para buscar cuentas remotas sin tener el cliente de LoL abierto.
            </p>
          </div>
          <span className="text-xs text-[#00E5FF] font-black px-3 py-1 bg-[#030814] border border-[#16335F] transform -skew-x-8 uppercase font-p3r-head">
            <span className="transform skew-x-8 inline-block">{showAdvancedRiotApi ? 'Ocultar ▲' : 'Configurar ▼'}</span>
          </span>
        </button>

        {showAdvancedRiotApi && (
          <div className="mt-4 pt-4 border-t-2 border-[#16335F]">
            <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2 flex items-center space-x-2 font-p3r-head">
              <span className="w-2 h-2 bg-[#00E5FF]"></span>
              <span>Sincronizar Datos con Riot Games</span>
            </h3>
            <p className="text-xs text-[#7E9BB8] mb-4">
              Descarga automáticamente tus estadísticas clasificatorias, maestría de campeones e historial reciente usando tu API Key oficial.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 font-mono">
              <div>
                <label className="text-[10px] text-[#7E9BB8] font-black uppercase block mb-1 font-p3r-head">Riot ID o Nombre (ej: Infi#1505)</label>
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
                  className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#7E9BB8] font-black uppercase block mb-1 font-p3r-head">Tag Line (sin #)</label>
                <input
                  type="text"
                  value={tagLine}
                  placeholder="1505"
                  onChange={(e) => setTagLine(e.target.value.replace(/#/g, '').trim())}
                  className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#7E9BB8] font-black uppercase block mb-1 font-p3r-head">Plataforma</label>
                <select
                  value={platform}
                  onChange={(e) => {
                    const p = e.target.value as PlatformRouting;
                    setPlatform(p);
                    setRegional(PLATFORM_ROUTING_MAP[p] || 'americas');
                  }}
                  className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-xs text-white focus:outline-none"
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
                <label className="text-[10px] text-[#7E9BB8] font-black uppercase block mb-1 font-p3r-head">Enrutamiento Regional</label>
                <input
                  type="text"
                  readOnly
                  value={PLATFORM_ROUTING_MAP[platform] || regional}
                  className="w-full bg-[#030814]/60 border border-[#16335F]/60 px-3 py-2 text-xs text-[#00E5FF] cursor-not-allowed"
                />
              </div>
            </div>

            <P3rButton
              variant="secondary"
              size="md"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Sincronizando con Riot API...' : 'Sincronizar Historial y Rango'}
            </P3rButton>

            {syncMessage && (
              <div
                className={`mt-3 p-3 text-xs font-bold border-2 p3r-cut-tr ${
                  syncMessage.type === 'success'
                    ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                    : 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                }`}
              >
                {syncMessage.text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Partidas Recientes // Estilo P3R */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-6 p3r-bevel p3r-shadow-hard">
        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
          <span className="w-2.5 h-2.5 bg-[#00E5FF] transform rotate-45"></span>
          <span>HISTORIAL DE PARTIDAS RECIENTES // BATTLE LOG</span>
        </h3>

        {safeMatches.length > 0 ? (
          <div className="space-y-2.5">
            {safeMatches.map((m) => (
              <div
                key={m.matchId}
                className={`p-3.5 border-2 flex flex-wrap items-center justify-between gap-3 p3r-cut-tr transition-all ${
                  m.win
                    ? 'bg-[#031512] border-[#00E676]/60 hover:border-[#00E676]'
                    : 'bg-[#1A050A] border-[#FF1744]/60 hover:border-[#FF1744]'
                }`}
              >
                <div className="flex items-center space-x-3.5">
                  <span
                    className={`w-2 h-10 ${
                      m.win ? 'bg-[#00E676]' : 'bg-[#FF1744]'
                    }`}
                  ></span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-white uppercase font-p3r-head tracking-wider">
                        {m.championName} <span className="font-mono text-[#7E9BB8] font-normal">(ID {m.championId})</span>
                      </span>
                      <span className="text-[10px] bg-[#030814] border border-[#16335F] text-[#00E5FF] px-1.5 py-0.2 font-mono">
                        {m.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#7E9BB8] font-mono">
                      <strong className={m.win ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                        {m.win ? 'VICTORIA' : 'DERROTA'}
                      </strong> • {Math.floor(m.gameDuration / 60)} min
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-6 text-xs font-mono">
                  <div>
                    <span className="text-[#7E9BB8] block text-[10px] uppercase font-bold">KDA</span>
                    <span className="text-white font-bold">
                      {m.kills}/{m.deaths}/{m.assists} ({m.kda})
                    </span>
                  </div>

                  <div>
                    <span className="text-[#7E9BB8] block text-[10px] uppercase font-bold">CS</span>
                    <span className="text-[#00E5FF] font-bold">
                      {m.cs} ({m.csPerMinute}/m)
                    </span>
                  </div>

                  <div>
                    <span className="text-[#7E9BB8] block text-[10px] uppercase font-bold">Oro</span>
                    <span className="text-[#FFE277] font-bold">
                      {m.goldEarned.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#7E9BB8] text-center py-8 font-mono bg-[#030814] border border-[#16335F] p3r-cut-tr">
            No hay partidas registradas aún. Pulsa sincronizar para cargar tu historial.
          </p>
        )}
      </div>
    </div>
  );
};
