import React, { useState, useEffect, useMemo } from 'react';
import { MetaLaneChampion, Role, AppSettings } from '../../shared/types';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';
import { OpGgClient } from '../../main/opgg/OpGgClient';
import { Ban, Sparkles, RefreshCw, ShieldAlert, Check, Plus, Flame, Swords } from 'lucide-react';

interface MetaSuggestionsPanelProps {
  initialRole?: Role;
  settings: AppSettings;
  onSaveSettings: (partial: Partial<AppSettings>) => void;
  isLiveChampSelect?: boolean;
  isMyBanTurn?: boolean;
  isMyPickTurn?: boolean;
  revealedEnemies?: Array<{ championId: number; championName?: string; role: Role }>;
  onHoverChampion?: (championId: number) => void;
  onInspectChampionBuild?: (championId: number, role: Role) => void;
  patchVersion?: string;
}

const ROLE_LABELS: Record<Role, string> = {
  TOP: 'TOP (Superior)',
  JUNGLE: 'JUNGLE (Jungla)',
  MIDDLE: 'MID (Central)',
  BOTTOM: 'ADC (Tirador)',
  UTILITY: 'SUPP (Soporte)',
  FILL: 'FILL (Polivalente)',
};

const SELECTABLE_ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

const fallbackOpggClient = new OpGgClient();

export const MetaSuggestionsPanel: React.FC<MetaSuggestionsPanelProps> = ({
  initialRole = 'MIDDLE',
  settings,
  onSaveSettings,
  isLiveChampSelect = false,
  isMyBanTurn = false,
  isMyPickTurn = false,
  revealedEnemies = [],
  onHoverChampion,
  onInspectChampionBuild,
  patchVersion = '16.20.1',
}) => {
  const [selectedRole, setSelectedRole] = useState<Role>(
    initialRole && initialRole !== 'FILL' ? initialRole : 'MIDDLE'
  );
  const [suggestionMode, setSuggestionMode] = useState<'ban' | 'pick'>('ban');
  const [metaByRole, setMetaByRole] = useState<Record<Role, MetaLaneChampion[]> | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialRole && initialRole !== 'FILL' && initialRole !== selectedRole) {
      setSelectedRole(initialRole);
    }
  }, [initialRole]);

  const loadMetaChampions = async (forceRefresh = false) => {
    setLoading(true);
    try {
      let data: Record<Role, MetaLaneChampion[]>;
      const apiAny = window.api as any;
      if (apiAny && typeof apiAny.getLaneMetaChampions === 'function') {
        data = await apiAny.getLaneMetaChampions(forceRefresh);
      } else {
        data = await fallbackOpggClient.getLaneMetaChampions(forceRefresh);
      }
      setMetaByRole(data);
    } catch {
      const fallback = await fallbackOpggClient.getLaneMetaChampions(false);
      setMetaByRole(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetaChampions(false);
  }, []);

  const roleChampions = useMemo(() => {
    if (!metaByRole) return [];
    return metaByRole[selectedRole] || metaByRole.MIDDLE || [];
  }, [metaByRole, selectedRole]);

  // Lista ordenada según modo (Ban prioriza banScore/banRate + winRate; Pick prioriza tier + winRate + playCount)
  const sortedTierList = useMemo(() => {
    const copy = [...roleChampions];
    if (suggestionMode === 'ban') {
      return copy.sort((a, b) => b.banScore - a.banScore);
    }
    return copy.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.winRate - a.winRate;
    });
  }, [roleChampions, suggestionMode]);

  // Top 6 sugerencias principales para las tarjetas derechas (#1 Suggestion .. #6 Suggestion)
  const topSixSuggestions = useMemo(() => {
    return sortedTierList.slice(0, 6);
  }, [sortedTierList]);

  const toPct = (val: number) => (val <= 1 ? val * 100 : val);

  // Favoritos del usuario en este rol (desde settings.autoChampSelect.rolePreferences)
  const rolePrefs = (settings?.autoChampSelect?.rolePreferences?.[selectedRole] as any) || {
    preferredChampions: [],
    fallbackChampions: [],
    banChampions: [],
  };

  const favoriteIds: number[] =
    suggestionMode === 'ban'
      ? rolePrefs.banChampions || rolePrefs.bans || []
      : rolePrefs.preferredChampions || rolePrefs.picks || [];

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => {
      setActionFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleToggleFavorite = (championId: number) => {
    const currentAuto = settings.autoChampSelect;
    const roleKey = (selectedRole === 'FILL' ? 'MIDDLE' : selectedRole) as Role;
    const currentRolePref: any = currentAuto.rolePreferences[roleKey] || {
      preferredChampions: [],
      fallbackChampions: [],
      banChampions: [],
      summonerSpells: [4, 14] as [number, number],
    };

    const listKey = suggestionMode === 'ban' ? 'banChampions' : 'preferredChampions';
    const currentList: number[] = currentRolePref[listKey] || [];
    const exists = currentList.includes(championId);

    const updatedList = exists
      ? currentList.filter((id) => id !== championId)
      : [championId, ...currentList].slice(0, 5);

    onSaveSettings({
      autoChampSelect: {
        ...currentAuto,
        rolePreferences: {
          ...currentAuto.rolePreferences,
          [roleKey]: {
            ...currentRolePref,
            [listKey]: updatedList,
          },
        },
      },
    });

    const champName = getChampionName(championId);
    if (exists) {
      showToast(`${champName} eliminado de tus ${suggestionMode === 'ban' ? 'bloqueos' : 'picks'} favoritos en ${roleKey}.`);
    } else {
      showToast(`✓ ${champName} fijado como #1 en tus ${suggestionMode === 'ban' ? 'Auto-Bans' : 'Auto-Picks'} de ${roleKey}.`);
    }
  };

  const handlePrimaryCardAction = (champ: MetaLaneChampion) => {
    if (isLiveChampSelect && onHoverChampion) {
      onHoverChampion(champ.championId);
      showToast(
        `Enviando ${champ.championName} al cliente de League of Legends (${suggestionMode === 'ban' ? 'Bloqueo' : 'Pick'})...`
      );
      return;
    }
    handleToggleFavorite(champ.championId);
  };

  const getTierBadgeStyle = (tier: number) => {
    if (tier === 1) {
      return {
        bg: 'bg-[#FF3D57]',
        border: 'border-[#FF8A9B]',
        text: 'text-white',
        label: '1',
      };
    }
    if (tier === 2) {
      return {
        bg: 'bg-[#F5A623]',
        border: 'border-[#FFE277]',
        text: 'text-[#030814]',
        label: '2',
      };
    }
    return {
      bg: 'bg-[#0066FF]',
      border: 'border-[#00E5FF]',
      text: 'text-white',
      label: String(tier),
    };
  };

  return (
    <div className="space-y-5 select-none">
      {/* Barra Superior de Filtros: Rol y Modo (Bans vs Picks) */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-4 p3r-bevel p3r-shadow-hard flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Modo: Bloqueos vs Picks */}
          <div className="flex items-center bg-[#030814] p-1 border border-[#16335F]">
            <button
              type="button"
              onClick={() => setSuggestionMode('ban')}
              className={`px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                suggestionMode === 'ban'
                  ? 'bg-[#FF1744] text-white border-l-2 border-white shadow-md'
                  : 'text-[#7E9BB8] hover:text-white'
              }`}
            >
              <Ban className="w-3.5 h-3.5 transform skew-x-8" />
              <span className="transform skew-x-8 inline-block">Sugerencias de Bloqueo (Bans)</span>
            </button>
            <button
              type="button"
              onClick={() => setSuggestionMode('pick')}
              className={`px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                suggestionMode === 'pick'
                  ? 'bg-[#00E5FF] text-[#030814] border-l-2 border-white shadow-md'
                  : 'text-[#7E9BB8] hover:text-white'
              }`}
            >
              <Swords className="w-3.5 h-3.5 transform skew-x-8" />
              <span className="transform skew-x-8 inline-block">Sugerencias de Pick (Meta)</span>
            </button>
          </div>

          {/* Selector de Línea / Rol */}
          <div className="flex items-center bg-[#030814] p-1 border border-[#16335F] space-x-1">
            {SELECTABLE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                className={`px-2.5 py-1 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer font-mono ${
                  selectedRole === r
                    ? 'bg-[#0066FF] text-white border-b-2 border-[#00E5FF]'
                    : 'text-[#7E9BB8] hover:text-white hover:bg-[#0A1936]'
                }`}
              >
                {ROLE_LABELS[r].split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono text-[#7E9BB8]">
            Fuente: <strong className="text-[#00E5FF]">OP.GG Meta Tier List (Esmeralda+)</strong>
          </span>
          <button
            type="button"
            onClick={() => loadMetaChampions(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-[#030814] hover:bg-[#0C1B38] border border-[#16335F] hover:border-[#00E5FF] text-xs font-bold text-[#00E5FF] flex items-center space-x-1.5 cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar Meta</span>
          </button>
        </div>
      </div>

      {/* Notificación de acción */}
      {actionFeedback && (
        <div className="bg-[#031A12] border-2 border-[#00E676] text-[#00E676] px-4 py-2.5 text-xs font-bold flex items-center justify-between p3r-cut-tr">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        </div>
      )}

      {/* Layout Principal de 2 Columnas (Idéntico a Imagen de Referencia 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (4 cols): Bans Tier List / Meta Tier List */}
        <div className="lg:col-span-4 bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard overflow-hidden">
          <div className="p-4 border-b-2 border-[#16335F] flex items-center justify-between bg-[#030814]">
            <div className="flex items-center space-x-2">
              <span
                className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded ${
                  suggestionMode === 'ban'
                    ? 'bg-[#FF1744]/20 text-[#FF5252] border border-[#FF1744]/50'
                    : 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50'
                }`}
              >
                {suggestionMode === 'ban' ? 'Bans Tier List' : 'Meta Picks Tier List'}
              </span>
              <span className="text-xs font-mono text-[#7E9BB8] font-bold">
                • {ROLE_LABELS[selectedRole].split(' ')[0]}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#7E9BB8] uppercase">Win Rate</span>
          </div>

          <div className="divide-y divide-[#16335F]/60 max-h-[600px] overflow-y-auto">
            {sortedTierList.map((champ) => {
              const badge = getTierBadgeStyle(champ.tier);
              const isFav = favoriteIds.includes(champ.championId);
              return (
                <div
                  key={champ.championId}
                  onClick={() =>
                    onInspectChampionBuild
                      ? onInspectChampionBuild(champ.championId, selectedRole)
                      : handlePrimaryCardAction(champ)
                  }
                  className="p-3 hover:bg-[#0A1936] transition flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={getChampionIconUrl(champ.championId, patchVersion)}
                        alt={champ.championName}
                        className="w-11 h-11 rounded object-cover border border-[#1E355B] group-hover:border-[#00E5FF]"
                      />
                      {isFav && (
                        <span
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#00E676] text-[#030814] flex items-center justify-center text-[9px] font-black"
                          title="En tus favoritos"
                        >
                          ★
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-black text-white group-hover:text-[#00E5FF] transition truncate">
                        {champ.championName}
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        {/* Insignia de Tier 1 / 2 / 3 */}
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-black border ${badge.bg} ${badge.border} ${badge.text}`}
                          title={`Tier ${champ.tier}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] font-mono text-[#7E9BB8]">
                          {(champ.play || 0).toLocaleString()} GAMES
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estadísticas a la derecha */}
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-xs font-mono">
                      <span className="text-[#7E9BB8] mr-1">Game</span>
                      <span
                        className={`font-black ${
                          toPct(champ.winRate) >= 52
                            ? 'text-[#00E5FF]'
                            : toPct(champ.winRate) >= 50.5
                            ? 'text-[#00E676]'
                            : 'text-white'
                        }`}
                      >
                        {toPct(champ.winRate).toFixed(1)}%
                      </span>
                    </div>
                    {champ.banRate > 0 && (
                      <div className="text-[10px] font-mono text-[#FF8A9B]">
                        Ban {toPct(champ.banRate).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA (8 cols): Tus Favoritos + 6 Tarjetas de Sugerencias Meta */}
        <div className="lg:col-span-8 space-y-6">
          {/* Bloque Superior: Your Favorite Bans / Picks */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p-5 p3r-bevel p3r-shadow-hard flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-white tracking-wide font-p3r uppercase">
                {suggestionMode === 'ban' ? 'Tus Bloqueos Favoritos (Your Favorite Bans)' : 'Tus Picks Favoritos (Your Favorite Picks)'}
              </h3>
              <p className="text-xs text-[#7E9BB8] mt-0.5">
                {suggestionMode === 'ban'
                  ? `Acceso rápido a los campeones que bloqueas automáticamente en ${ROLE_LABELS[selectedRole]}.`
                  : `Acceso rápido a tu pool de campeones configurados en ${ROLE_LABELS[selectedRole]}.`}
              </p>
            </div>

            <div className="flex items-center space-x-2.5 flex-wrap">
              {favoriteIds.length > 0 ? (
                favoriteIds.map((favId, idx) => (
                  <div
                    key={favId}
                    onClick={() => {
                      if (isLiveChampSelect && onHoverChampion) {
                        onHoverChampion(favId);
                        showToast(`Enviando ${getChampionName(favId)} al cliente de LoL...`);
                      } else if (onInspectChampionBuild) {
                        onInspectChampionBuild(favId, selectedRole);
                      }
                    }}
                    className="relative group cursor-pointer"
                    title={`${getChampionName(favId)} (#${idx + 1}) - Clic para usar`}
                  >
                    <img
                      src={getChampionIconUrl(favId, patchVersion)}
                      alt={getChampionName(favId)}
                      className={`w-12 h-12 rounded-lg object-cover border-2 transition transform group-hover:scale-105 ${
                        suggestionMode === 'ban'
                          ? 'border-[#FF1744] group-hover:border-white'
                          : 'border-[#00E5FF] group-hover:border-white'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(favId);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#030814] border border-[#FF1744] text-[#FF1744] hover:bg-[#FF1744] hover:text-white text-[9px] font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      title="Quitar de favoritos"
                    >
                      ✕
                    </button>
                  </div>
                ))
              ) : (
                <span className="text-xs text-[#7E9BB8] italic bg-[#030814] px-3 py-2 border border-[#16335F]">
                  Aún no tienes favoritos en {selectedRole}. Haz clic en &ldquo;{suggestionMode === 'ban' ? 'Ban' : 'Pick'}&rdquo; abajo para añadir.
                </span>
              )}
            </div>
          </div>

          {/* Bloque Principal: Meta Ban Suggestions / Meta Pick Suggestions (Grid 3x2) */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p-6 p3r-bevel p3r-shadow-hard">
            <div className="mb-5">
              <h3 className="text-lg font-black text-white tracking-wide flex items-center space-x-2">
                <Flame className={`w-5 h-5 ${suggestionMode === 'ban' ? 'text-[#FF3D57]' : 'text-[#00E5FF]'}`} />
                <span>
                  {suggestionMode === 'ban'
                    ? 'Meta ban suggestions (Sugerencias de bloqueo del meta)'
                    : 'Meta pick suggestions (Sugerencias de selección del meta)'}
                </span>
              </h3>
              <p className="text-xs text-[#7E9BB8] mt-0.5">
                {suggestionMode === 'ban'
                  ? 'Los campeones más fuertes, dominantes y populares en tu rol actual.'
                  : 'Los campeones de Tier 1 con mayor porcentaje de victoria en tu posición.'}
              </p>
            </div>

            {revealedEnemies.length > 0 && suggestionMode === 'pick' && (
              <div className="mb-4 bg-[#030814] border border-[#00E5FF] p-3 p3r-cut-tr flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <Swords className="w-4 h-4 text-[#00E5FF]" />
                  <span className="text-white font-bold font-p3r-head uppercase">
                    Rivales detectados en partida:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 ml-1">
                    {revealedEnemies.map((e) => (
                      <span key={e.championId} className="inline-flex items-center space-x-1 bg-[#050E20] border border-[#16335F] px-2 py-0.5 text-[11px] text-[#00E5FF]">
                        <img src={getChampionIconUrl(e.championId, patchVersion)} alt={e.championName || ''} className="w-3.5 h-3.5 rounded-full" />
                        <span>{e.championName || getChampionName(e.championId)} ({e.role})</span>
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-[#7E9BB8] font-mono">
                  Sugerencias optimizadas para confrontación
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {topSixSuggestions.map((champ, idx) => {
                const badge = getTierBadgeStyle(champ.tier);
                const isFav = favoriteIds.includes(champ.championId);
                const isFirst = idx === 0;

                return (
                  <div
                    key={champ.championId}
                    className={`bg-[#081226] border-2 rounded-xl p-5 flex flex-col items-center text-center transition-all relative group ${
                      isFirst
                        ? 'border-[#F5A623]/80 shadow-[0_0_20px_rgba(245,166,35,0.12)]'
                        : 'border-[#16335F] hover:border-[#00E5FF]'
                    }`}
                  >
                    {/* Retrato del Campeón con Borde y Badge de Tier inferior centrado (Estilo Imagen 2) */}
                    <div className="relative mb-3">
                      <div
                        className={`w-20 h-20 rounded-xl overflow-hidden border-2 p-0.5 ${
                          suggestionMode === 'ban'
                            ? 'border-[#FF3D57] bg-[#2A0912]'
                            : 'border-[#00E5FF] bg-[#041E3A]'
                        }`}
                      >
                        <img
                          src={getChampionIconUrl(champ.championId, patchVersion)}
                          alt={champ.championName}
                          className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>

                      {/* Insignia de Tier en la base del retrato */}
                      <div
                        className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[11px] font-black border shadow-md ${badge.bg} ${badge.border} ${badge.text}`}
                      >
                        {badge.label}
                      </div>
                    </div>

                    {/* Nombre del Campeón */}
                    <h4 className="text-base font-black text-white mt-1">
                      {champ.championName}
                    </h4>

                    {/* Etiqueta #1 Suggestion .. #6 Suggestion */}
                    <span
                      className={`text-xs font-bold mt-0.5 ${
                        isFirst ? 'text-[#F5A623]' : 'text-[#7E9BB8]'
                      }`}
                    >
                      #{idx + 1} Suggestion
                    </span>

                    {/* Estadísticas Resumidas */}
                    <div className="flex items-center justify-center space-x-2 mt-2 mb-4 text-[11px] font-mono">
                      <span className="text-[#00E676] font-bold">{toPct(champ.winRate).toFixed(1)}% WR</span>
                      <span className="text-[#4A627E]">•</span>
                      <span className="text-[#94A3B8]">{(champ.play || 0).toLocaleString()} part.</span>
                    </div>

                    {/* Botón Principal: Ban / Pick */}
                    <div className="w-full space-y-2 mt-auto">
                      <button
                        type="button"
                        onClick={() => handlePrimaryCardAction(champ)}
                        className={`w-full py-2 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                          suggestionMode === 'ban'
                            ? isFav
                              ? 'bg-[#FF1744] text-white border border-white'
                              : 'bg-[#162642] hover:bg-[#FF1744] text-white border border-[#263F6A] hover:border-[#FF8A9B]'
                            : isFav
                            ? 'bg-[#00E5FF] text-[#030814] border border-white'
                            : 'bg-[#162642] hover:bg-[#00E5FF] text-white hover:text-[#030814] border border-[#263F6A] hover:border-white'
                        }`}
                      >
                        {suggestionMode === 'ban' ? (
                          <>
                            <Ban className="w-3.5 h-3.5" />
                            <span>
                              {isLiveChampSelect
                                ? isMyBanTurn
                                  ? 'Bloquear en LoL'
                                  : 'Pre-Bloquear'
                                : isFav
                                ? 'En Auto-Ban (Quitar)'
                                : 'Ban (Fijar Auto-Ban)'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {isLiveChampSelect
                                ? isMyPickTurn
                                  ? 'Seleccionar en LoL'
                                  : 'Preparar Pick'
                                : isFav
                                ? 'En Auto-Pick (Quitar)'
                                : 'Pick (Fijar Favorito)'}
                            </span>
                          </>
                        )}
                      </button>

                      {onInspectChampionBuild && (
                        <button
                          type="button"
                          onClick={() => onInspectChampionBuild(champ.championId, selectedRole)}
                          className="w-full py-1.5 px-3 rounded text-[11px] font-bold text-[#7E9BB8] hover:text-[#00E5FF] hover:bg-[#030814] transition cursor-pointer"
                        >
                          Ver Runas &amp; Build →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
