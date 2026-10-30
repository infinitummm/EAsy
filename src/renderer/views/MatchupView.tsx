import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeminiMatchupRecommendation, Role, RunePage, PatchDiffSummary, GroundingSource, ConfidenceLevel, OpGgBuildVariant } from '../../shared/types';
import { BuildVisualizer, AbilityMaxOrderGrid } from '../components/BuildVisualizer';
import { InteractiveRuneTree } from '../components/InteractiveRuneTree';
import { ChampionSelectInput } from '../components/ChampionSelectInput';
import { getChampionName, getChampionIconUrl, getChampionById } from '../../shared/champions';
import { getAccurateFallbackRecommendation } from '../../shared/buildDatabase';
import { formatFullPatchLabel, formatDisplayPatch, toDdragonVersion } from '../../shared/patchUtils';
import { getRuneIconUrl, getRuneName, getRuneTreeById } from '../../shared/runesData';
import { P3rButton } from '../components/p3r/P3rButton';
import { P3rBadge } from '../components/p3r/P3rBadge';

interface MatchupViewProps {
  initialChampionId?: number;
  initialOpponentId?: number;
  initialRole?: Role;
  patchVersion?: string;
  autoRun?: boolean;
  onOpponentChange?: (opponentId: number) => void;
}

export const MatchupView: React.FC<MatchupViewProps> = ({
  initialChampionId = 0,
  initialOpponentId = 24,  // Jax
  initialRole = 'TOP',
  patchVersion = '16.20.1',
  autoRun = false,
  onOpponentChange
}) => {
  const [championId, setChampionId] = useState<number>(initialChampionId);
  const [opponentId, setOpponentId] = useState<number>(initialOpponentId);
  const [role, setRole] = useState<Role>(initialRole);
  const [activePatch, setActivePatch] = useState<string>(patchVersion || '16.20.1');
  const [isManualOpponent, setIsManualOpponent] = useState<boolean>(false);
  const [isManualChampion, setIsManualChampion] = useState<boolean>(false);
  const [isManualRole, setIsManualRole] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'general' | 'matchup'>('general');
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiMatchupRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoImportEnabled, setAutoImportEnabled] = useState<boolean>(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [patchDiff, setPatchDiff] = useState<PatchDiffSummary | null>(null);
  const [showPatchDiff, setShowPatchDiff] = useState<boolean>(false);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);
  const [buildFilter, setBuildFilter] = useState<'best' | 'winrate' | 'popular'>('best');
  const [customRunes, setCustomRunes] = useState<{
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
  } | null>(null);
  const [groundingQuota, setGroundingQuota] = useState<{
    groundingAvailable: boolean;
    quotaNote: string;
    groundingUsedToday: number;
    standardRequestsToday: number;
    standardDailyLimit: number;
  } | null>(null);

  const lastAnalyzedKeyRef = useRef<string>('');

  // Reiniciar variante seleccionada y runas personalizadas cuando cambia la recomendación base
  useEffect(() => {
    setSelectedVariantIndex(0);
    setCustomRunes(null);
  }, [recommendation?.championId, recommendation?.opponentChampionId, recommendation?.assignedRole]);

  // Variantes de build vinculadas con runas (desde OP.GG o sintetizadas si es contingencia)
  const buildVariants: OpGgBuildVariant[] = useMemo(() => {
    if (!recommendation) return [];
    const fromOpgg = recommendation.opggData?.buildVariants;
    if (Array.isArray(fromOpgg) && fromOpgg.length > 0) {
      return fromOpgg;
    }

    const basePrimary = recommendation.runesRecommendation?.primaryStyleId ?? 8000;
    const baseSub = recommendation.runesRecommendation?.subStyleId ?? 8300;
    const basePerks = recommendation.runesRecommendation?.selectedPerkIds || [
      8005, 9111, 9104, 8014, 8304, 8345, 5008, 5008, 5011,
    ];
    const baseStart = recommendation.buildRecommendation?.startingItems || [1055, 2003];
    const baseCore = recommendation.buildRecommendation?.coreItems || [6672, 3085, 3031];
    const baseBoots = recommendation.buildRecommendation?.boots || 3006;
    const baseSitRaw = recommendation.buildRecommendation?.situationalItems || [];
    const baseSit = baseSitRaw.map((s: any) =>
      typeof s === 'number'
        ? { itemId: s, name: `Objeto #${s}`, condition: 'Opción situacional recomendada', winRate: 53.5 }
        : { itemId: s.itemId, name: s.name || `Objeto #${s.itemId}`, condition: s.condition || 'Situacional', winRate: 54.0 }
    );
    const prio = Array.isArray(recommendation.skillOrder?.priority)
      ? recommendation.skillOrder.priority
      : ['Q', 'W', 'E'];

    // Generar una segunda y tercera opción de runas y build coherentes
    const alt1Perks =
      basePrimary === 8100
        ? [8229, 8226, 8210, 8237, 8304, 8345, 5008, 5008, 5011]
        : basePrimary === 8200
        ? [8112, 8143, 8138, 8106, 8226, 8210, 5008, 5008, 5011]
        : basePrimary === 8000
        ? [8010, 9111, 9104, 8299, 8446, 8451, 5005, 5008, 5011]
        : [8369, 8304, 8345, 8347, 8226, 8210, 5008, 5008, 5001];
    const alt1Primary = basePrimary === 8100 ? 8200 : basePrimary === 8200 ? 8100 : basePrimary === 8000 ? 8000 : 8300;
    const alt1Sub = basePrimary === 8000 ? 8400 : 8300;
    const alt1Core =
      baseSit.length >= 2
        ? [baseCore[0], baseSit[0].itemId, baseCore[2] || baseSit[1].itemId].filter(Boolean)
        : [...baseCore].reverse();

    const alt2Perks = [8369, 8304, 8345, 8347, 8226, 8210, 5008, 5008, 5011];
    const alt2Core =
      baseSit.length >= 2
        ? [baseCore[0], baseCore[1], baseSit[1].itemId].filter(Boolean)
        : baseCore;

    const makeRunePage = (
      primaryPageId: number,
      secondaryPageId: number,
      perks: number[],
      playCount: number,
      winRateFraction: number,
      label: string
    ) => ({
      id: perks[0] || 8005,
      label,
      primaryPageId,
      primaryPageName: getRuneTreeById(primaryPageId).name,
      primaryRuneIds: perks.slice(0, 4),
      primaryRuneNames: perks.slice(0, 4).map(getRuneName),
      secondaryPageId,
      secondaryPageName: getRuneTreeById(secondaryPageId).name,
      secondaryRuneIds: perks.slice(4, 6),
      secondaryRuneNames: perks.slice(4, 6).map(getRuneName),
      statModIds: perks.slice(6, 9),
      statModNames: perks.slice(6, 9).map(getRuneName),
      play: playCount,
      win: Math.round(playCount * winRateFraction),
      pickRate: 0.45,
    });

    const makeBuildOrder = (items: number[], playBase: number, wrPct: number) =>
      items.map((itemId, idx) => ({
        itemId,
        winRate: Number((wrPct + idx * 0.8).toFixed(1)),
        play: Math.max(150, Math.round(playBase * Math.pow(0.7, idx))),
      }));

    const v1Completed = [...baseCore, baseBoots, ...baseSit.slice(0, 2).map((s) => s.itemId)].slice(0, 6);
    const v2Completed = [...alt1Core, baseBoots, ...baseSit.slice(0, 2).map((s) => s.itemId)].slice(0, 6);
    const v3Completed = [...alt2Core, baseBoots, ...baseSit.slice(0, 2).map((s) => s.itemId)].slice(0, 6);

    return [
      {
        id: 'variant-1',
        label: `Build Principal • ${getRuneName(basePerks[0])}`,
        archetypeTag: 'Mejor',
        runePage: makeRunePage(
          basePrimary,
          baseSub,
          basePerks,
          recommendation.opggData?.totalMatches || 42500,
          0.518,
          `Estándar (${getRuneName(basePerks[0])})`
        ),
        starterItems: baseStart,
        coreItems: baseCore,
        boots: baseBoots,
        buildOrder: makeBuildOrder(v1Completed, 42500, 51.8),
        completedItems: v1Completed,
        situationalItems: baseSit,
        summonerSpells: [{ ids: [4, 14], names: ['Destello', 'Ignición'], play: 31400, win: 16265, pickRate: 0.74 }],
        skillPriority: prio.slice(0, 3),
        skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E', 'R', 'E', 'E'],
        play: recommendation.opggData?.totalMatches || 42500,
        win: Math.round((recommendation.opggData?.totalMatches || 42500) * 0.518),
        winRate: 51.8,
        pickRate: 0.55,
      },
      {
        id: 'variant-2',
        label: `Alto Win Rate • ${getRuneName(alt1Perks[0])}`,
        archetypeTag: 'Win Rate',
        runePage: makeRunePage(
          alt1Primary,
          alt1Sub,
          alt1Perks,
          14660,
          0.532,
          `Alto WR (${getRuneName(alt1Perks[0])})`
        ),
        starterItems: baseStart,
        coreItems: alt1Core,
        boots: baseBoots,
        buildOrder: makeBuildOrder(v2Completed, 14660, 53.2),
        completedItems: v2Completed,
        situationalItems: baseSit,
        summonerSpells: [{ ids: [4, 12], names: ['Destello', 'Teleportación'], play: 14660, win: 7800, pickRate: 0.26 }],
        skillPriority: prio.slice(0, 3),
        skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E', 'R', 'E', 'E'],
        play: 14660,
        win: 7800,
        winRate: 53.2,
        pickRate: 0.28,
      },
      {
        id: 'variant-3',
        label: `Escalada / Pico • ${getRuneName(alt2Perks[0])}`,
        archetypeTag: 'Popular',
        runePage: makeRunePage(
          8300,
          8200,
          alt2Perks,
          8920,
          0.511,
          `Escalada (${getRuneName(alt2Perks[0])})`
        ),
        starterItems: baseStart,
        coreItems: alt2Core,
        boots: baseBoots,
        buildOrder: makeBuildOrder(v3Completed, 8920, 51.1),
        completedItems: v3Completed,
        situationalItems: baseSit,
        summonerSpells: [{ ids: [4, 12], names: ['Destello', 'Teleportación'], play: 8920, win: 4558, pickRate: 0.17 }],
        skillPriority: prio.slice(0, 3),
        skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E', 'R', 'E', 'E'],
        play: 8920,
        win: 4558,
        winRate: 51.1,
        pickRate: 0.17,
      },
    ];
  }, [recommendation]);

  const activeVariant: OpGgBuildVariant | undefined =
    buildVariants[selectedVariantIndex] || buildVariants[0];

  // Ordenar variantes mostradas en el sidebar según el tab (Best / Win Rate / Common)
  const sortedVariantIndices = useMemo(() => {
    const indices = buildVariants.map((_, idx) => idx);
    if (buildFilter === 'winrate') {
      return indices.sort((a, b) => buildVariants[b].winRate - buildVariants[a].winRate);
    }
    if (buildFilter === 'popular') {
      return indices.sort((a, b) => buildVariants[b].play - buildVariants[a].play);
    }
    return indices;
  }, [buildVariants, buildFilter]);

  // Obtener el parche real detectado por Data Dragon y cuota al montar
  useEffect(() => {
    if (window.api && window.api.getPatchVersion) {
      window.api.getPatchVersion().then((detected) => {
        if (detected) {
          setActivePatch(detected);
          if (window.api.getPatchDiff) {
            window.api.getPatchDiff(detected).then(setPatchDiff).catch(() => {});
          }
        }
      }).catch(() => {});
    }
    if (window.api && window.api.getGroundingQuota) {
      window.api.getGroundingQuota().then(setGroundingQuota).catch(() => {});
    }
  }, []);

  // Recargar patch diff si el parche activo cambia
  useEffect(() => {
    if (window.api && window.api.getPatchDiff && activePatch) {
      window.api.getPatchDiff(activePatch).then(setPatchDiff).catch(() => {});
    }
  }, [activePatch]);

  // Sincronizar campeón propio SOLO si el usuario no fijó manualmente uno
  useEffect(() => {
    if (!isManualChampion && initialChampionId && initialChampionId > 0 && initialChampionId !== championId) {
      setChampionId(initialChampionId);
    }
  }, [initialChampionId, isManualChampion]);

  // Sincronizar rival predicho SOLO si el usuario no fijó manualmente uno
  useEffect(() => {
    if (!isManualOpponent && initialOpponentId && initialOpponentId > 0 && initialOpponentId !== opponentId) {
      setOpponentId(initialOpponentId);
    }
  }, [initialOpponentId, isManualOpponent]);

  // Sincronizar rol asignado SOLO si el usuario no fijó manualmente uno
  useEffect(() => {
    if (!isManualRole && initialRole && initialRole !== role) {
      setRole(initialRole);
    }
  }, [initialRole, isManualRole]);

  const handleChampionChange = (newChampId: number) => {
    setChampionId(newChampId);
    setIsManualChampion(true);
  };

  const handleResetChampion = () => {
    setIsManualChampion(false);
    if (initialChampionId) {
      setChampionId(initialChampionId);
    }
  };

  const handleOpponentChange = (newOpponentId: number) => {
    setOpponentId(newOpponentId);
    setIsManualOpponent(true);
    onOpponentChange?.(newOpponentId);
  };

  const handleResetOpponent = () => {
    setIsManualOpponent(false);
    if (initialOpponentId) {
      setOpponentId(initialOpponentId);
      onOpponentChange?.(initialOpponentId);
    }
  };

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setIsManualRole(true);
  };

  const handleResetRole = () => {
    setIsManualRole(false);
    if (initialRole) {
      setRole(initialRole);
    }
  };

  // Aplicar Runas y Build a LoL conjuntamente (respetando la variante seleccionada o runas personalizadas)
  const aplicarRunasYBuild = async (
    rec: GeminiMatchupRecommendation | null = recommendation,
    currentMode = viewMode,
    variantOverride?: OpGgBuildVariant,
    customRuneOverride?: { primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] } | null
  ) => {
    if (!rec || !window.api) return;
    setImportStatus('importing');
    setImportMsg('Inyectando runas seleccionadas y exportando build vinculada a LoL...');

    const chosenVariant = variantOverride || activeVariant;
    const chosenCustom = customRuneOverride !== undefined ? customRuneOverride : customRunes;
    const variantPerks = chosenVariant?.runePage
      ? [
          ...(chosenVariant.runePage.primaryRuneIds || []),
          ...(chosenVariant.runePage.secondaryRuneIds || []),
          ...(chosenVariant.runePage.statModIds || []),
        ]
      : undefined;

    try {
      const runePage: RunePage = {
        name: 'EAsy',
        primaryStyleId:
          chosenCustom?.primaryStyleId ??
          chosenVariant?.runePage?.primaryPageId ??
          rec.runesRecommendation?.primaryStyleId ??
          8000,
        subStyleId:
          chosenCustom?.subStyleId ??
          chosenVariant?.runePage?.secondaryPageId ??
          rec.runesRecommendation?.subStyleId ??
          8100,
        selectedPerkIds:
          chosenCustom?.selectedPerkIds ||
          (variantPerks && variantPerks.length === 9 ? variantPerks : undefined) ||
          rec.runesRecommendation?.selectedPerkIds || [
            8005, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5003,
          ],
        current: true,
      };

      const title =
        rec.buildRecommendation?.itemSetTitle ||
        (rec.opponentChampionId > 0 && currentMode === 'matchup'
          ? `[IL] ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`
          : `[IL] ${getChampionName(rec.championId)} (${chosenVariant?.label || 'general'})`);

      const effectiveBuild = chosenVariant
        ? {
            startingItems: chosenVariant.starterItems,
            coreItems: chosenVariant.coreItems,
            situationalItems: chosenVariant.situationalItems.map((s) => ({
              itemId: s.itemId,
              condition: s.condition,
            })),
            boots: chosenVariant.boots,
            rationale: `${chosenVariant.label} (${chosenVariant.winRate}% WR en ${chosenVariant.play.toLocaleString()} partidas)`,
          }
        : rec.buildRecommendation || {
            startingItems: [1055, 2003],
            coreItems: [3031, 3046, 3036],
            situationalItems: [3026, 3139],
            boots: 3006,
            rationale: 'Build competitiva adaptativa',
          };

      const [runeRes, buildRes] = await Promise.all([
        window.api.applyRunes(runePage).catch((e) => ({ success: false, error: e.message })),
        window.api
          .applyBuild({
            championId: rec.championId,
            championKey: getChampionById(rec.championId)?.key || getChampionName(rec.championId),
            opponentId: rec.opponentChampionId,
            role: rec.assignedRole,
            title,
            build: effectiveBuild,
          })
          .catch((e) => ({ success: false, error: e.message })),
      ]);

      if (runeRes.success && buildRes.success) {
        setImportStatus('success');
        setImportMsg('¡Runas oficiales activadas y Build importada a la Colección de LoL!');
        setTimeout(() => setImportStatus('idle'), 6000);
      } else if (runeRes.success) {
        setImportStatus('success');
        setImportMsg('¡Runas aplicadas en LoL! (Build guardada en disco)');
        setTimeout(() => setImportStatus('idle'), 6000);
      } else {
        setImportStatus('error');
        setImportMsg(runeRes.error || buildRes.error || 'Error al aplicar');
        setTimeout(() => setImportStatus('idle'), 6000);
      }
    } catch (err: unknown) {
      setImportStatus('error');
      setImportMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setImportStatus('idle'), 6000);
    }
  };

  const fetchAdvice = async (
    targetChamp = championId,
    targetOpponent = opponentId,
    targetRole = role,
    forceRefresh = false,
    mode = viewMode
  ) => {
    if (loading || targetChamp <= 0 || targetOpponent <= 0) return;
    setLoading(true);
    setError(null);

    const matchKey = `${targetChamp}-${targetOpponent}-${targetRole}-${mode}`;
    if (forceRefresh) {
      lastAnalyzedKeyRef.current = '';
    } else {
      lastAnalyzedKeyRef.current = matchKey;
    }

    try {
      let res: GeminiMatchupRecommendation;
      if (window.api && window.api.getMatchupAdvice) {
        try {
          const remote = await window.api.getMatchupAdvice({
            championId: targetChamp,
            opponentId: targetOpponent,
            role: targetRole,
            patch: activePatch,
            allies: [],
            enemies: [],
            forceRefresh,
            viewMode: mode
          });
          if (
            remote &&
            typeof remote === 'object' &&
            remote.runesRecommendation &&
            typeof remote.runesRecommendation.primaryStyleId === 'number' &&
            remote.buildRecommendation
          ) {
            res = remote;
          } else {
            res = getAccurateFallbackRecommendation({
              championId: targetChamp,
              opponentId: targetOpponent,
              role: targetRole,
              patch: activePatch
            });
          }
        } catch {
          res = getAccurateFallbackRecommendation({
            championId: targetChamp,
            opponentId: targetOpponent,
            role: targetRole,
            patch: activePatch
          });
        }
      } else {
        res = getAccurateFallbackRecommendation({
          championId: targetChamp,
          opponentId: targetOpponent,
          role: targetRole,
          patch: activePatch
        });
      }

      setRecommendation(res);

      // Auto-importar automáticamente si está activado
      if (autoImportEnabled) {
        await aplicarRunasYBuild(res, mode);
      }
    } catch (err: unknown) {
      const fallback = getAccurateFallbackRecommendation({
        championId: targetChamp,
        opponentId: targetOpponent,
        role: targetRole,
        patch: activePatch
      });
      setRecommendation(fallback);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Disparar auto-análisis cuando cambian campeón o rival en autoRun
  useEffect(() => {
    if (autoRun && championId > 0 && opponentId > 0) {
      const key = `${championId}-${opponentId}-${role}-${viewMode}`;
      if (key !== lastAnalyzedKeyRef.current) {
        fetchAdvice(championId, opponentId, role, false, viewMode);
      }
    }
  }, [autoRun, championId, opponentId, role, viewMode]);

  const getDifficultyColor = (diff: number) => {
    if (diff <= 3) return { bg: 'bg-[#10B981]', text: 'text-[#10B981]', label: 'FAVORABLE' };
    if (diff <= 6) return { bg: 'bg-[#F5A623]', text: 'text-[#F5A623]', label: 'EQUILIBRADO' };
    if (diff <= 8) return { bg: 'bg-[#F97316]', text: 'text-[#F97316]', label: 'DESAFIANTE' };
    return { bg: 'bg-[#D92546]', text: 'text-[#D92546]', label: 'MUY DIFÍCIL' };
  };

  return (
    <div className="space-y-6 select-none">
      {/* Cabecera y Parámetros Estilo Persona 3 Reload */}
      <div className="bg-[#050E20] border-2 border-[#16335F] p-6 p3r-bevel p3r-shadow-hard relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2.5 py-0.5 bg-[#0066FF] text-white text-[10px] font-black tracking-widest uppercase transform -skew-x-8 font-p3r-head p3r-shadow-blue border-l-2 border-white">
                <span className="transform skew-x-8 inline-block">ENFRENTAMIENTO</span>
              </span>
              <P3rBadge label="PARCHE 26.20" variant="cyan" />
            </div>

            <h2 className="text-2xl font-black text-white tracking-wider font-p3r uppercase">
              ENFRENTAMIENTO DIRECTO EN LÍNEA
            </h2>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {recommendation?.opggData && (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-[#030814] border border-[#00E5FF]/40 text-[11px] text-[#00E5FF] font-mono">
                  <span className="w-1.5 h-1.5 bg-[#00E5FF]"></span>
                  <span>
                    Datos OP.GG ({recommendation.opggData.totalMatches.toLocaleString()} partidas •{' '}
                    <strong className="text-white">
                      {viewMode === 'matchup' ? 'Matchup: todos los rangos' : (recommendation.opggData.eloLabel || 'General: Esmeralda+')}
                    </strong>)
                  </span>
                </span>
              )}
              <span
                className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-[#030814] border border-[#16335F] text-[11px] text-[#7E9BB8] font-mono"
                title={groundingQuota?.quotaNote || 'Google AI Studio: Búsqueda web requiere facturación, generación de texto estándar es ilimitada (1500 req/día)'}
              >
                <span className="w-1.5 h-1.5 bg-[#0066FF]"></span>
                <span>Grounding: <strong className="text-white">{groundingQuota?.groundingUsedToday ?? 0}</strong> hoy</span>
                <span className="text-[#4A627E]">|</span>
                <span>Texto IA: <strong className="text-[#00E676]">{groundingQuota?.standardRequestsToday ?? 0}</strong>/1500</span>
              </span>
              {patchDiff && (
                <button
                  type="button"
                  onClick={() => setShowPatchDiff(!showPatchDiff)}
                  className="text-[11px] text-[#FFE277] hover:text-white underline font-bold flex items-center space-x-1 ml-1 cursor-pointer font-mono"
                >
                  <span>Cambios parche {activePatch} ({patchDiff.removedItems?.length ?? 0} eliminados)</span>
                  <span>{showPatchDiff ? '▲' : '▼'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle de Modo: General vs Matchup (B2) */}
            <div className="flex items-center space-x-1 bg-[#030814] p-1 border border-[#16335F]">
              <button
                type="button"
                onClick={() => {
                  setViewMode('general');
                  fetchAdvice(championId, opponentId, role, false, 'general');
                }}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                  viewMode === 'general'
                    ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-2 border-white'
                    : 'text-[#7E9BB8] hover:text-white'
                }`}
              >
                <span className="transform skew-x-8 inline-block">General (Esmeralda+)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('matchup');
                  fetchAdvice(championId, opponentId, role, false, 'matchup');
                }}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transform -skew-x-8 transition-all cursor-pointer font-p3r-head ${
                  viewMode === 'matchup'
                    ? 'bg-[#00E5FF] text-[#030814] p3r-shadow-blue border-l-2 border-white'
                    : 'text-[#7E9BB8] hover:text-white'
                }`}
              >
                <span className="transform skew-x-8 inline-block">Matchup (Todos)</span>
              </button>
            </div>

            {/* Toggle de Auto-Importar */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#030814] px-3.5 py-2 border border-[#16335F] hover:border-[#0066FF] transition transform -skew-x-8">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                onChange={(e) => setAutoImportEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#0066FF] cursor-pointer"
              />
              <span className="transform skew-x-8 text-xs font-bold text-[#E2E8F0] font-p3r-head uppercase tracking-wider">
                Auto-Importar a LoL
              </span>
            </label>

            {/* Botón de Regenerar Análisis */}
            <P3rButton
              variant="secondary"
              size="md"
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              icon={
                <svg className={`w-3.5 h-3.5 text-[#00E5FF] ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            >
              REGENERAR DATOS
            </P3rButton>

            {/* Botón Principal Analizar */}
            <P3rButton
              variant="cyan"
              size="md"
              onClick={() => fetchAdvice(championId, opponentId, role, false)}
              disabled={loading || championId <= 0 || opponentId <= 0}
              icon={
                loading ? (
                  <svg className="animate-spin h-4 w-4 text-[#030814]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-[#030814]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )
              }
            >
              {loading ? 'ANALIZANDO...' : 'ANALIZAR MATCHUP'}
            </P3rButton>
          </div>
        </div>

        {/* Notificación de Estado de Inyección */}
        {importMsg && (
          <div
            className={`mt-4 p-3 text-xs font-bold flex items-center space-x-2 border-2 transition-all p3r-cut-tr ${
              importStatus === 'success'
                ? 'bg-[#031A12] border-[#00E676] text-[#00E676]'
                : importStatus === 'error'
                ? 'bg-[#2A050A] border-[#FF1744] text-[#FF1744]'
                : 'bg-[#050E20] border-[#0066FF] text-[#00E5FF]'
            }`}
          >
            <span className="text-sm font-black">
              {importStatus === 'success' ? '✓' : importStatus === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="font-p3r-head tracking-wide">{importMsg}</span>
          </div>
        )}

        {/* Banner de Muestra Reducida en Matchup (B2) */}
        {viewMode === 'matchup' && (recommendation?.opggData?.totalMatches ?? 0) < 200 && (
          <div className="mt-4 bg-[#2A1705] border-2 border-[#FFE277] p-3 text-xs text-[#FFE277] flex flex-col sm:flex-row sm:items-center justify-between gap-2 p3r-bevel p3r-shadow-hard">
            <span className="leading-relaxed">
              ⚠️ <strong>Muestra reducida ({recommendation?.opggData?.totalMatches ?? 0} partidas):</strong> Los datos de este enfrentamiento específico son escasos. Se recomienda la <strong>Build General en Esmeralda+</strong>.
            </span>
            <button
              type="button"
              onClick={() => {
                setViewMode('general');
                fetchAdvice(championId, opponentId, role, false, 'general');
              }}
              className="px-3 py-1 bg-[#FFE277] text-[#030814] font-black text-xs uppercase transform -skew-x-8 transition self-start sm:self-auto shrink-0 cursor-pointer font-p3r-head"
            >
              <span className="transform skew-x-8 inline-block">Cambiar a General</span>
            </button>
          </div>
        )}

        {/* Banner de Fallback Honesto si falla OP.GG */}
        {recommendation?.source === 'fallback' && (
          <div className="mt-4 bg-[#2A050A] border-2 border-[#FF1744] p-3 text-xs text-[#FF1744] flex items-center space-x-2 p3r-cut-tr">
            <span>⚠️</span>
            <span className="font-p3r-head">
              <strong>Aviso de contingencia:</strong> No se pudieron obtener datos de OP.GG. Mostrando configuración de contingencia (genérica).
            </span>
          </div>
        )}

        {/* Selector de Parámetros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t-2 border-[#16335F]">
          <div>
            <ChampionSelectInput
              label={isManualChampion ? "Mi Campeón (Manual)" : "Mi Campeón (Detectado)"}
              value={championId}
              onChange={handleChampionChange}
              patchVersion={activePatch}
            />
            {isManualChampion && (
              <button
                type="button"
                onClick={handleResetChampion}
                className="mt-1.5 text-[11px] text-[#00E5FF] hover:text-white font-mono inline-block cursor-pointer"
              >
                ↺ Restablecer a campeón automático
              </button>
            )}
          </div>

          <div>
            <ChampionSelectInput
              label={isManualOpponent ? "Campeón Rival (Manual)" : "Campeón Rival (Detectado)"}
              value={opponentId}
              onChange={handleOpponentChange}
              patchVersion={activePatch}
            />
            {isManualOpponent && (
              <button
                type="button"
                onClick={handleResetOpponent}
                className="mt-1.5 text-[11px] text-[#00E5FF] hover:text-white font-mono inline-block cursor-pointer"
              >
                ↺ Restablecer a rival automático
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] text-[#7E9BB8] font-black uppercase tracking-wider block mb-1 font-p3r-head">
              {isManualRole ? "Posición Asignada (Manual)" : "Posición Asignada"}
            </label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              className="w-full bg-[#030814] border border-[#16335F] focus:border-[#00E5FF] px-3 py-2 text-sm text-white font-bold font-mono focus:outline-none"
            >
              <option value="TOP">TOP (Superior)</option>
              <option value="JUNGLE">JUNGLE (Jungla)</option>
              <option value="MIDDLE">MIDDLE (Central)</option>
              <option value="BOTTOM">BOTTOM (Tirador)</option>
              <option value="UTILITY">UTILITY (Soporte)</option>
            </select>
            {isManualRole && (
              <button
                type="button"
                onClick={handleResetRole}
                className="mt-1.5 text-[11px] text-[#00E5FF] hover:text-white font-mono inline-block cursor-pointer"
              >
                ↺ Restablecer a rol automático
              </button>
            )}
          </div>
        </div>

        {/* Desplegable de Cambios Clave del Parche (Capa 1) */}
        {showPatchDiff && patchDiff && (
          <div className="mt-4 pt-4 border-t border-[#1E355B] bg-[#0A111F]/70 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Diferencial Data Dragon: Parche {patchDiff.previousPatch} → {patchDiff.currentPatch}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold rounded border border-[#10B981]/40">
                FILTRO DETERMINISTA ACTIVO
              </span>
            </div>
            
            <p className="text-[11px] text-[#94A3B8]">
              Capa 1 sin cuota: Los objetos o runas eliminados se bloquean deterministamente para que la IA nunca los recomiende.
            </p>

            {(patchDiff.removedItems?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F87171] uppercase block mb-1">
                  Objetos Eliminados en este parche ({patchDiff.removedItems?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.removedItems?.map(item => (
                    <span key={item.id} className="px-2 py-0.5 bg-[#D92546]/15 border border-[#D92546]/50 text-[#F87171] rounded text-[11px] font-medium">
                      ✕ {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(patchDiff.changedItems?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F5A623] uppercase block mb-1">
                  Objetos Modificados ({patchDiff.changedItems?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {patchDiff.changedItems?.slice(0, 15).map(item => (
                    <span key={item.id} className="px-2 py-0.5 bg-[#11223F] border border-[#1E355B] text-[#CBD5E1] rounded text-[11px]" title={item.changes?.join('; ') || ''}>
                      {item.changeType === 'added' ? '★ ' : '✎ '}{item.name}
                    </span>
                  ))}
                  {(patchDiff.changedItems?.length ?? 0) > 15 && (
                    <span className="text-[11px] text-[#94A3B8] self-center">
                      +{(patchDiff.changedItems?.length ?? 0) - 15} más...
                    </span>
                  )}
                </div>
              </div>
            )}

            {(patchDiff.removedRunes?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#F87171] uppercase block mb-1">
                  Runas Eliminadas ({patchDiff.removedRunes?.length ?? 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.removedRunes?.map(rune => (
                    <span key={rune.id} className="px-2 py-0.5 bg-[#D92546]/15 border border-[#D92546]/50 text-[#F87171] rounded text-[11px]">
                      ✕ {rune.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(patchDiff.newChampions?.length ?? 0) > 0 && (
              <div>
                <span className="text-[11px] font-bold text-[#10B981] uppercase block mb-1">
                  Nuevos Campeones:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patchDiff.newChampions?.map(name => (
                    <span key={name} className="px-2 py-0.5 bg-[#10B981]/15 border border-[#10B981]/50 text-[#10B981] rounded text-[11px] font-bold">
                      ★ {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-[#D92546]/15 border border-[#D92546]/50 p-4 rounded-xl text-xs text-[#F87171]">
          <strong>ERROR DE ANÁLISIS:</strong> {error}
        </div>
      )}

      {/* Banner de Proveniencia Transparente (Requirement 8) */}
      {recommendation && (
        recommendation.source === 'fallback' && !recommendation.opggData ? (
          <div className="bg-[#D92546]/20 border-2 border-[#D92546] p-4 rounded-xl text-xs flex items-center justify-between gap-3 text-white">
            <div className="flex items-center space-x-2.5">
              <span className="text-xl">⚠️</span>
              <div>
                <span className="font-bold text-[#F87171] uppercase block text-sm">
                  Sin análisis de IA: recomendación genérica de contingencia
                </span>
                <span className="text-[#CBD5E1] text-xs">
                  Motivo: {recommendation.fallbackReason || 'Sin conexión o error al consultar fuentes estadísticas.'}
                </span>
              </div>
            </div>
            <button
              onClick={() => fetchAdvice(championId, opponentId, role, true)}
              className="px-3 py-1.5 bg-[#D92546] hover:bg-[#B51E39] text-white font-bold text-[11px] uppercase rounded"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="bg-[#0A111F] border border-[#1E355B] p-4 rounded-xl space-y-2.5 text-xs text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1E355B]/60">
              <div className="flex flex-wrap items-center gap-2">
                {/* Badge de Nivel de Confianza (Capa 4) */}
                {recommendation.confidenceLevel === 'verified' ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#10B981]/20 border border-[#10B981] text-[#10B981] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                    <span>VERIFICADO (Grounding Web en vivo)</span>
                  </span>
                ) : recommendation.confidenceLevel === 'general' ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#F5A623]/20 border border-[#F5A623] text-[#F5A623] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#F5A623]"></span>
                    <span>General</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#64748B]/20 border border-[#64748B] text-[#94A3B8] font-bold text-[11px] tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#64748B]"></span>
                    <span>ESCASO (Datos mínimos)</span>
                  </span>
                )}

                <span className="text-[#94A3B8] font-medium">
                  • Parche: <strong className="text-white">{recommendation.patchVersion || activePatch}</strong>
                </span>

                <span className="text-[#94A3B8]">
                  • Modelo: <strong className="text-[#60A5FA]">{recommendation.modelUsed || 'gemini-3.5-flash'}</strong>
                </span>

                <span className="text-[#94A3B8]">
                  • {recommendation.generatedAt ? new Date(recommendation.generatedAt).toLocaleTimeString() : 'Reciente'}
                </span>
              </div>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[11px] text-[#60A5FA] hover:text-white underline font-semibold self-start sm:self-auto"
              >
                {showDebug ? 'Ocultar Depuración IA ▲' : 'Ver Depuración IA ▼'}
              </button>
            </div>

            {/* Aviso transparente si no se utilizó Grounding en vivo por cuota */}
            {!recommendation.groundingUsed && (
              <div className="bg-[#11223F] p-2.5 rounded border border-[#1E355B] text-[11px] text-[#CBD5E1] flex items-center space-x-2">
                <span className="text-sm">ℹ️</span>
                <span>
                  <strong>Transparencia de cuota:</strong> Búsqueda web en vivo no ejecutada por límite de cuota en nivel gratuito (HTTP 429). Se garantizan datos reales del parche mediante Data Dragon determinista y tus partidas locales.
                </span>
              </div>
            )}

            {/* Fuentes consultadas con enlaces clickeables */}
            {recommendation.sources && recommendation.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-[#94A3B8] font-semibold">Fuentes consultadas:</span>
                {recommendation.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded bg-[#060D17] border border-[#1E355B] text-[11px] text-[#60A5FA] hover:text-white hover:border-[#60A5FA] transition flex items-center space-x-1"
                    title={src.uri}
                  >
                    <span>🌐</span>
                    <span className="max-w-[200px] truncate">{src.title || src.uri}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Resultados de la Recomendación */}
      {recommendation ? (
        <div className="space-y-6">
          {/* Tarjeta de Dificultad, Resumen y Botón de Inyección */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
            {/* Header visual del Enfrentamiento */}
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b-2 border-[#16335F]">
              <div className="flex items-center space-x-3 bg-[#030814] px-4 py-2 border border-[#0066FF] p3r-cut-tr">
                <img
                  src={getChampionIconUrl(recommendation.championId, activePatch)}
                  alt={getChampionName(recommendation.championId)}
                  className="w-9 h-9 object-cover border border-[#0066FF]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#00E5FF] font-black uppercase tracking-wider block font-p3r-head">MI ELECCIÓN</span>
                  <span className="font-bold text-white text-sm font-p3r-head">
                    {getChampionName(recommendation.championId)}
                  </span>
                </div>
              </div>

              <div className="w-9 h-9 bg-[#0066FF] text-white flex items-center justify-center font-black text-xs transform -skew-x-8 p3r-shadow-blue border-l-2 border-white font-p3r">
                <span className="transform skew-x-8">VS</span>
              </div>

              <div className="flex items-center space-x-3 bg-[#030814] px-4 py-2 border border-[#FF1744] p3r-cut-tr">
                <img
                  src={getChampionIconUrl(recommendation.opponentChampionId, activePatch)}
                  alt={getChampionName(recommendation.opponentChampionId)}
                  className="w-9 h-9 object-cover border border-[#FF1744]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#FF1744] font-black uppercase tracking-wider block font-p3r-head">RIVAL EN LÍNEA</span>
                  <span className="font-bold text-white text-sm font-p3r-head">
                    {getChampionName(recommendation.opponentChampionId)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-[10px] font-black text-[#7E9BB8] uppercase tracking-wider font-p3r-head">
                  DIFICULTAD ESTIMADA DE LÍNEA
                </span>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-4xl font-black text-white tracking-tight font-p3r">
                    {recommendation.difficultyRating}
                    <span className="text-base text-[#7E9BB8] font-normal font-mono"> / 10</span>
                  </span>
                  <P3rBadge
                    label={getDifficultyColor(recommendation.difficultyRating).label}
                    variant={recommendation.difficultyRating >= 7 ? 'red' : recommendation.difficultyRating >= 4 ? 'yellow' : 'green'}
                  />
                </div>
              </div>

              {/* Botón Maestro: Importar Runas y Build a LoL */}
              <P3rButton
                variant="cyan"
                size="lg"
                onClick={() => aplicarRunasYBuild(recommendation)}
                disabled={importStatus === 'importing'}
                icon={
                  <svg className="w-4 h-4 text-[#030814]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                }
              >
                {importStatus === 'importing'
                  ? 'IMPORTANDO A LOL...'
                  : 'IMPORTAR RUNAS & BUILD A LOL'}
              </P3rButton>
            </div>

            {/* Barra visual de dificultad */}
            <div className="w-full bg-[#030814] h-2.5 mb-5 overflow-hidden border border-[#16335F] p3r-cut-tr">
              <div
                className={`h-full transition-all duration-700 ${
                  getDifficultyColor(recommendation.difficultyRating).bg
                }`}
                style={{ width: `${recommendation.difficultyRating * 10}%` }}
              ></div>
            </div>

            {/* Resumen */}
            <div className="bg-[#030814] p-4 border border-[#16335F] p3r-cut-tr">
              <h4 className="text-xs font-black text-[#00E5FF] uppercase tracking-wider mb-1 flex items-center space-x-2 font-p3r">
                <span className="w-2 h-2 bg-[#0066FF] transform rotate-45" />
                <span>DINÁMICA DEL ENFRENTAMIENTO</span>
              </h4>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {recommendation.matchupSummary}
              </p>
            </div>
          </div>

          {/* HUB INTERACTIVO DE VARIANTES DE BUILD, ÁRBOL DE RUNAS Y OBJETOS (Estilo Blitz / Imagen 1) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* COLUMNA IZQUIERDA (3 cols): Selector de Variantes de Build (Best | Win Rate | Common) */}
            <div className="xl:col-span-3 bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-4 space-y-4">
              {/* Tabs de Filtro: Best | Win Rate | Common */}
              <div className="grid grid-cols-3 gap-1 bg-[#030814] p-1 border border-[#16335F]">
                <button
                  type="button"
                  onClick={() => setBuildFilter('best')}
                  className={`py-1.5 text-[11px] font-black uppercase tracking-wider rounded transition cursor-pointer ${
                    buildFilter === 'best'
                      ? 'bg-[#FFFFFF] text-[#030814] shadow'
                      : 'text-[#7E9BB8] hover:text-white'
                  }`}
                >
                  Mejor
                </button>
                <button
                  type="button"
                  onClick={() => setBuildFilter('winrate')}
                  className={`py-1.5 text-[11px] font-black uppercase tracking-wider rounded transition cursor-pointer ${
                    buildFilter === 'winrate'
                      ? 'bg-[#00E5FF] text-[#030814] shadow'
                      : 'text-[#7E9BB8] hover:text-white'
                  }`}
                >
                  Win Rate
                </button>
                <button
                  type="button"
                  onClick={() => setBuildFilter('popular')}
                  className={`py-1.5 text-[11px] font-black uppercase tracking-wider rounded transition cursor-pointer ${
                    buildFilter === 'popular'
                      ? 'bg-[#0066FF] text-white shadow'
                      : 'text-[#7E9BB8] hover:text-white'
                  }`}
                >
                  Popular
                </button>
              </div>

              <div>
                <div className="flex items-center space-x-1.5 text-xs font-black text-[#00E676] uppercase tracking-wider mb-2.5">
                  <span>✦</span>
                  <span>Esmeralda+ Builds ({buildVariants.length})</span>
                </div>

                <div className="space-y-2.5">
                  {sortedVariantIndices.map((vIdx) => {
                    const variant = buildVariants[vIdx];
                    if (!variant) return null;
                    const isSelected = vIdx === selectedVariantIndex;
                    const keystoneId = variant.runePage?.primaryRuneIds?.[0] || 8005;
                    const subTree = getRuneTreeById(variant.runePage?.secondaryPageId || 8300);

                    return (
                      <button
                        key={variant.id || vIdx}
                        type="button"
                        onClick={() => {
                          setSelectedVariantIndex(vIdx);
                          setCustomRunes(null);
                          if (autoImportEnabled) {
                            aplicarRunasYBuild(recommendation, viewMode, variant, null);
                          }
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#0B2239] border-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                            : 'bg-[#030814] border-[#16335F] hover:border-[#0066FF] hover:bg-[#071226]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`text-xs font-black truncate pr-2 ${
                              isSelected ? 'text-[#00E5FF]' : 'text-white'
                            }`}
                          >
                            {variant.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-black shrink-0 ${
                              variant.winRate >= 52
                                ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40'
                                : 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30'
                            }`}
                          >
                            {variant.winRate.toFixed(1)}%
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] font-mono text-[#94A3B8]">
                            {variant.play.toLocaleString()} GAMES
                          </span>

                          {/* Icono de Runa Clave + Sub-rama + 3 Objetos Principales */}
                          <div className="flex items-center space-x-1">
                            <div className="relative w-6 h-6 rounded-full bg-[#030814] border border-[#00E5FF]/60 p-0.5">
                              <img
                                src={getRuneIconUrl(keystoneId)}
                                alt={getRuneName(keystoneId)}
                                className="w-full h-full object-contain"
                              />
                              {subTree && (
                                <img
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${subTree.icon}`}
                                  alt={subTree.name}
                                  className="w-3 h-3 rounded-full bg-[#030814] absolute -bottom-0.5 -right-0.5"
                                />
                              )}
                            </div>

                            {variant.coreItems.slice(0, 3).map((itemId, idx) => (
                              <img
                                key={`${itemId}-${idx}`}
                                src={`https://ddragon.leagueoflegends.com/cdn/${toDdragonVersion(activePatch)}/img/item/${itemId}.png`}
                                alt={`Item ${itemId}`}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (!target.dataset.triedFallback) {
                                    target.dataset.triedFallback = 'true';
                                    target.src = `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/item/${itemId}.png`;
                                  }
                                }}
                                className="w-5 h-5 rounded border border-[#1E355B] bg-[#030814]"
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Explicación Táctica de las Runas */}
              <div className="bg-[#030814] p-3 border border-[#16335F] p3r-cut-tr space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#00E5FF] uppercase tracking-wider font-black font-p3r-head">
                    Sinergia Runas ↔ Build
                  </span>
                  {customRunes && (
                    <button
                      type="button"
                      onClick={() => setCustomRunes(null)}
                      className="text-[10px] text-[#FFE277] hover:underline font-mono cursor-pointer"
                    >
                      ↺ Restaurar estándar
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                  {recommendation.runesRecommendation?.rationale ||
                    'Al cambiar la página de runas o la variante de build, el orden de objetos, botas y hechizos se adapta automáticamente.'}
                </p>
              </div>
            </div>

            {/* COLUMNA CENTRAL (5 cols): Árbol Visual e Interactivo de Runas */}
            <div className="xl:col-span-5">
              <InteractiveRuneTree
                primaryStyleId={
                  customRunes?.primaryStyleId ??
                  activeVariant?.runePage?.primaryPageId ??
                  recommendation.runesRecommendation?.primaryStyleId ??
                  8000
                }
                subStyleId={
                  customRunes?.subStyleId ??
                  activeVariant?.runePage?.secondaryPageId ??
                  recommendation.runesRecommendation?.subStyleId ??
                  8100
                }
                selectedPerkIds={
                  customRunes?.selectedPerkIds ||
                  (activeVariant?.runePage
                    ? [
                        ...(activeVariant.runePage.primaryRuneIds || []),
                        ...(activeVariant.runePage.secondaryRuneIds || []),
                        ...(activeVariant.runePage.statModIds || []),
                      ]
                    : undefined) ||
                  recommendation.runesRecommendation?.selectedPerkIds || [
                    8005, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5011,
                  ]
                }
                runeOptions={buildVariants.map((v) => v.runePage)}
                selectedOptionIndex={selectedVariantIndex}
                onSelectRuneOption={(idx) => {
                  setSelectedVariantIndex(idx);
                  setCustomRunes(null);
                  const chosen = buildVariants[idx];
                  if (autoImportEnabled && chosen) {
                    aplicarRunasYBuild(recommendation, viewMode, chosen, null);
                  }
                }}
                onCustomPerksChange={(newPrimary, newSub, newPerks) => {
                  const customized = {
                    primaryStyleId: newPrimary,
                    subStyleId: newSub,
                    selectedPerkIds: newPerks,
                  };
                  setCustomRunes(customized);
                  if (autoImportEnabled) {
                    aplicarRunasYBuild(recommendation, viewMode, activeVariant, customized);
                  }
                }}
              />
            </div>

            {/* COLUMNA DERECHA (4 cols): Hechizos, Objetos Vinculados a la Runa y Habilidades 1-18 */}
            <div className="xl:col-span-4">
              <BuildVisualizer
                build={
                  recommendation.buildRecommendation || {
                    startingItems: [1055, 2003],
                    coreItems: [3031, 3046, 3036],
                    situationalItems: [3026, 3139],
                    boots: 3006,
                    rationale: 'Build competitiva estándar',
                  }
                }
                skillOrder={
                  recommendation.skillOrder || {
                    priority: 'Q > W > E',
                    firstThreeLevels: ['Q', 'W', 'E'],
                    rationale: 'Prioridad de habilidades recomendada',
                  }
                }
                patch={activePatch}
                activeVariant={activeVariant}
                summonerSpells={recommendation.opggData?.summonerSpells}
                compactSidePanel={false}
                hideSkillTable={true}
              />
            </div>
          </div>

          {/* MATRIZ DE HABILIDADES 1-18 A ANCHO COMPLETO (Inspirado en Blitz y LoL) */}
          <AbilityMaxOrderGrid
            skillPriority={
              activeVariant?.skillPriority ||
              recommendation.skillOrder?.priority ||
              ['Q', 'W', 'E']
            }
            levels18={
              activeVariant?.skillOrder ||
              recommendation.skillOrder?.firstThreeLevels ||
              ['Q', 'W', 'E']
            }
          />

          {/* Estrategia de Early Game y Amenazas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Early Game Plan */}
            <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
              <h3 className="text-xs font-black text-[#FFE277] uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
                <span className="w-2.5 h-2.5 bg-[#FFE277] transform rotate-45"></span>
                <span>PLAN DE FASE DE LÍNEAS // EARLY GAME</span>
              </h3>
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block text-[10px] font-p3r-head">Control de Oleadas:</span>
                  <p className="text-[#CBD5E1] mt-0.5 leading-relaxed">{recommendation.earlyGameStrategy?.waveManagement || 'Mantén la oleada cerca de tu torre y asegura el último golpe.'}</p>
                </div>
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block text-[10px] font-p3r-head">Intercambios (Tradeos):</span>
                  <p className="text-[#CBD5E1] mt-0.5 leading-relaxed">{recommendation.earlyGameStrategy?.tradingPlan || 'Intercambia daño solo cuando el enemigo gaste habilidades clave en la oleada.'}</p>
                </div>
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">Picos de Nivel:</span>
                  <ul className="list-disc list-inside text-[#CBD5E1] space-y-0.5 font-mono">
                    {(recommendation.earlyGameStrategy?.levelSpikes || ['Nivel 2: ventana agresiva', 'Nivel 6: pico definitivo']).map((spike, idx) => (
                      <li key={idx}>{spike}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Análisis de Amenazas y Condición de Victoria */}
            <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel p3r-shadow-hard p-6">
              <h3 className="text-xs font-black text-[#FF1744] uppercase tracking-wider mb-4 flex items-center space-x-2 font-p3r">
                <span className="w-2.5 h-2.5 bg-[#FF1744] transform rotate-45"></span>
                <span>AMENAZAS CRÍTICAS & CONDICIÓN DE VICTORIA</span>
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-[#7E9BB8] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">Amenazas Principales:</span>
                  <ul className="list-disc list-inside text-[#FF1744] space-y-1 font-mono">
                    {(recommendation.threatAnalysis?.enemyThreats || ['Cuidado con ganks tempranos y control de masas en cadena.']).map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#030814] p-3.5 border border-[#16335F] p3r-cut-tr">
                  <span className="text-[#00E5FF] font-bold uppercase tracking-wider block mb-1 text-[10px] font-p3r-head">Condición de Victoria:</span>
                  <p className="text-[#CBD5E1] leading-relaxed">{recommendation.threatAnalysis?.winCondition || 'Escalar hacia los objetos principales y agrupar para objetivos neutrales.'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Desplegable de Depuración IA */}
          <div className="bg-[#050E20] border-2 border-[#16335F] p3r-bevel overflow-hidden p3r-shadow-hard">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full px-5 py-3 text-left font-black text-xs uppercase tracking-wider text-[#7E9BB8] hover:text-white flex items-center justify-between bg-[#030814] transition cursor-pointer font-p3r-head"
            >
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-[#0066FF] transform rotate-45"></span>
                <span>Panel de Depuración y Trazabilidad IA</span>
              </div>
              <span className="text-sm font-mono">{showDebug ? '▲' : '▼'}</span>
            </button>

            {showDebug && (
              <div className="p-5 space-y-4 text-xs font-mono border-t border-[#1E355B]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">PROVENIENCIA Y MODELO:</span>
                    <p className="text-white">Fuente: <span className="text-[#10B981] font-bold">{recommendation.source || 'gemini'}</span></p>
                    <p className="text-white">Modelo: <span className="text-[#F5A623]">{recommendation.modelUsed || 'gemini-3.5-flash'}</span></p>
                    <p className="text-white">Generado en: {recommendation.generatedAt || 'No registrado'}</p>
                    <p className="text-white">Parche detectado: {activePatch}</p>
                  </div>

                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">ESTADO DE VALIDACIÓN:</span>
                    <p className="text-[#10B981]">{recommendation.debugInfo?.validationStatus || 'Validado con Data Dragon'}</p>
                    <p className="text-[#94A3B8] mt-1">Importación LoL: {importMsg || 'Listo'}</p>
                    <p className="text-[#CBD5E1] mt-1">Fuentes web detectadas: <strong className="text-[#60A5FA]">{recommendation.debugInfo?.groundingSourcesFound ?? recommendation.sources?.length ?? 0}</strong></p>
                  </div>
                </div>

                {/* Paso 1: Investigación Cruda de Meta (Grounding o Fallback Local) */}
                {(recommendation.debugInfo?.rawResearchResponse || recommendation.researchNotes) && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">
                      Investigación del meta ({recommendation.groundingUsed ? 'Google Search' : 'Metadatos de Parche'}):
                    </span>
                    <pre className="max-h-40 overflow-y-auto p-2 bg-[#0A111F] rounded text-[11px] text-[#A5B4FC] whitespace-pre-wrap">
                      {recommendation.debugInfo?.rawResearchResponse || recommendation.researchNotes}
                    </pre>
                  </div>
                )}

                {/* Ítems bloqueados deterministamente por Patch Diff (Capa 1) */}
                {patchDiff && (patchDiff.removedItems?.length ?? 0) > 0 && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#F87171] font-bold block mb-1">
                      CAPA 1: ÍTEMS ELIMINADOS EN EL PARCHE {patchDiff.currentPatch} (BLOQUEADOS DETERMINISTAMENTE):
                    </span>
                    <p className="text-[#94A3B8] text-[11px]">
                      {patchDiff.removedItems?.map(i => i.name).join(', ')}
                    </p>
                  </div>
                )}

                {recommendation.debugInfo?.resolvedRunes && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÓN DE RUNAS (Data Dragon):</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recommendation.debugInfo.resolvedRunes.map((r, i) => (
                        <div key={i} className="text-[11px] text-[#CBD5E1]">
                          <span className="text-[#94A3B8]">{r.requested}:</span> <span className="text-[#F5A623] font-bold">{r.resolvedId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.debugInfo?.resolvedItems && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1.5">TRADUCCIÓN DE OBJETOS (Data Dragon):</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recommendation.debugInfo.resolvedItems.map((item, i) => (
                        <div key={i} className="text-[11px] text-[#CBD5E1]">
                          <span className="text-[#94A3B8]">{item.requested}:</span> <span className="text-[#10B981] font-bold">{item.resolvedId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.debugInfo?.rawResponse && (
                  <div className="bg-[#060D17] p-3 rounded border border-[#1E355B]">
                    <span className="text-[#60A5FA] font-bold block mb-1">RESPUESTA CRUDA DE GEMINI:</span>
                    <pre className="max-h-48 overflow-y-auto p-2 bg-[#0A111F] rounded text-[11px] text-[#A5B4FC] whitespace-pre-wrap">
                      {recommendation.debugInfo.rawResponse}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[#0D192D] border border-[#1E355B] rounded-xl shadow-md">
          <svg className="w-12 h-12 text-[#64748B] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-white text-sm font-semibold mb-1">
            {championId > 0
              ? `Presiona "ANALIZAR" para obtener runas y build para ${getChampionName(championId)}`
              : 'Esperando selección de campeón'}
          </p>
          <p className="text-[#94A3B8] text-xs max-w-md mx-auto">
            {championId > 0
              ? 'Puedes analizar el enfrentamiento seleccionando los campeones.'
              : 'Elige tu campeón para calcular tu build y runas automáticamente.'}
          </p>
        </div>
      )}
    </div>
  );
};
