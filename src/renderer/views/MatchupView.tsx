import React, { useState, useEffect, useRef } from 'react';
import { GeminiMatchupRecommendation, Role, RunePage } from '../../shared/types';
import { BuildVisualizer } from '../components/BuildVisualizer';
import { ChampionSelectInput } from '../components/ChampionSelectInput';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';

interface MatchupViewProps {
  initialChampionId?: number;
  initialOpponentId?: number;
  initialRole?: Role;
  patchVersion?: string;
  autoRun?: boolean;
}

export const MatchupView: React.FC<MatchupViewProps> = ({
  initialChampionId = 266, // Aatrox
  initialOpponentId = 24,  // Jax
  initialRole = 'TOP',
  patchVersion = '14.20.1',
  autoRun = false
}) => {
  const [championId, setChampionId] = useState<number>(initialChampionId);
  const [opponentId, setOpponentId] = useState<number>(initialOpponentId);
  const [role, setRole] = useState<Role>(initialRole);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiMatchupRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoImportEnabled, setAutoImportEnabled] = useState<boolean>(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState<string>('');

  const lastAnalyzedKeyRef = useRef<string>('');

  // Sincronizar props cuando el cliente de LoL actualiza la selección
  useEffect(() => {
    if (initialChampionId && initialChampionId > 0 && initialChampionId !== championId) {
      setChampionId(initialChampionId);
    }
  }, [initialChampionId]);

  useEffect(() => {
    if (initialOpponentId && initialOpponentId > 0 && initialOpponentId !== opponentId) {
      setOpponentId(initialOpponentId);
    }
  }, [initialOpponentId]);

  useEffect(() => {
    if (initialRole && initialRole !== role) {
      setRole(initialRole);
    }
  }, [initialRole]);

  // Aplicar Runas y Build a LoL conjuntamente
  const aplicarRunasYBuild = async (rec: GeminiMatchupRecommendation | null = recommendation) => {
    if (!rec || !window.api) return;
    setImportStatus('importing');
    setImportMsg('Inyectando runas y exportando build a LoL...');

    try {
      const runePage: RunePage = {
        name: `Itero: ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`,
        primaryStyleId: rec.runesRecommendation.primaryStyleId,
        subStyleId: rec.runesRecommendation.subStyleId,
        selectedPerkIds: rec.runesRecommendation.selectedPerkIds,
        current: true
      };

      const [runeRes, buildRes] = await Promise.all([
        window.api.applyRunes(runePage).catch((e) => ({ success: false, error: e.message })),
        window.api.applyBuild({
          championId: rec.championId,
          title: `Itero: ${getChampionName(rec.championId)} vs ${getChampionName(rec.opponentChampionId)}`,
          build: rec.buildRecommendation
        }).catch((e) => ({ success: false, error: e.message }))
      ]);

      if (runeRes.success && buildRes.success) {
        setImportStatus('success');
        setImportMsg('¡Runas oficiales y Build importadas al cliente de LoL!');
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

  const fetchAdvice = async (targetChamp = championId, targetOpponent = opponentId, targetRole = role) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    const matchKey = `${targetChamp}-${targetOpponent}-${targetRole}`;
    lastAnalyzedKeyRef.current = matchKey;

    try {
      let res: GeminiMatchupRecommendation;
      if (window.api && window.api.getMatchupAdvice) {
        res = await window.api.getMatchupAdvice({
          championId: targetChamp,
          opponentId: targetOpponent,
          role: targetRole,
          patch: patchVersion,
          allies: [],
          enemies: []
        });
      } else {
        // Mock fallback seguro Season 14 (5008, 5008, 5011)
        res = {
          championId: targetChamp,
          opponentChampionId: targetOpponent,
          assignedRole: targetRole,
          patchVersion,
          difficultyRating: 7,
          matchupSummary: 'Enfrentamiento de desgaste. Mantén la distancia con tus habilidades y castiga los enfriamientos del rival.',
          runesRecommendation: {
            primaryStyleId: 8000,
            subStyleId: 8400,
            selectedPerkIds: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5011],
            rationale: 'Conquistador para sostener peleas largas y mitigación secundaria en Valor.'
          },
          buildRecommendation: {
            startingItems: [1055, 2003],
            coreItems: [3078, 6631, 3053],
            situationalItems: [
              { itemId: 3026, condition: 'Frente a daño explosivo adverso' },
              { itemId: 3156, condition: 'Frente a campeones con alto burst mágico' }
            ],
            rationale: 'Daño continuo con aceleración de habilidad y resistencias para aguantar all-in.'
          },
          skillOrder: {
            priority: ['Q', 'E', 'W', 'R'],
            firstThreeLevels: ['Q', 'E', 'W'],
            rationale: 'Prioriza tu habilidad de rango y daño principal en la fase de líneas.'
          },
          earlyGameStrategy: {
            waveManagement: 'Controla la oleada cerca de tu torre en los primeros 3 niveles.',
            tradingPlan: 'Espera a que el rival gaste su habilidad clave antes de iniciar un tradeo largo.',
            levelSpikes: ['Nivel 2 con ventaja de súbditos', 'Nivel 6 para ejecutar combo completo']
          },
          threatAnalysis: {
            enemyThreats: ['Peligro de ganks tempranos del jungla rival'],
            winCondition: 'Conseguir ventaja de oro en línea y forzar peleas en objetivos neutrales.'
          }
        };
      }

      setRecommendation(res);

      // Auto-importar automáticamente si está activado
      if (autoImportEnabled) {
        await aplicarRunasYBuild(res);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Disparar auto-análisis cuando cambian campeón o rival en autoRun
  useEffect(() => {
    if (autoRun && championId > 0 && opponentId > 0) {
      const key = `${championId}-${opponentId}-${role}`;
      if (key !== lastAnalyzedKeyRef.current) {
        fetchAdvice(championId, opponentId, role);
      }
    }
  }, [autoRun, championId, opponentId, role]);

  const getDifficultyColor = (diff: number) => {
    if (diff <= 3) return { bg: 'bg-[#00FFB2]', text: 'text-[#00FFB2]', label: 'FAVORABLE' };
    if (diff <= 6) return { bg: 'bg-[#FFD700]', text: 'text-[#FFD700]', label: 'EQUILIBRADO' };
    if (diff <= 8) return { bg: 'bg-[#FF8800]', text: 'text-[#FF8800]', label: 'DESAFIANTE' };
    return { bg: 'bg-[#FF2E63]', text: 'text-[#FF2E63]', label: 'MUY DIFÍCIL' };
  };

  const currentRunePage: RunePage = recommendation
    ? {
        name: `Itero: ${getChampionName(recommendation.championId)} vs ${getChampionName(recommendation.opponentChampionId)}`,
        primaryStyleId: recommendation.runesRecommendation.primaryStyleId,
        subStyleId: recommendation.runesRecommendation.subStyleId,
        selectedPerkIds: recommendation.runesRecommendation.selectedPerkIds,
        current: true
      }
    : {
        name: 'Itero: Runas IA',
        primaryStyleId: 8000,
        subStyleId: 8400,
        selectedPerkIds: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5011],
        current: true
      };

  return (
    <div className="space-y-6">
      {/* Cabecera y Parámetros Estilo Persona 3 Reload */}
      <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#00D4FF]/10 to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-block px-2.5 py-0.5 mb-2 bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00F0FF] text-[10px] font-black tracking-widest uppercase transform -skew-x-6">
              TACTICAL INTEL // P3R
            </div>
            <h2 className="text-xl font-black text-white flex items-center space-x-2 tracking-wide">
              <span>ANÁLISIS DE ENFRENTAMIENTO</span>
              <span className="text-[#00D4FF] font-mono text-sm">// GEMINI AI</span>
            </h2>
            <p className="text-xs text-[#6F92BF] mt-1 font-mono">
              Build de objetos in-game, runas completas S14 y guía táctica sincronizada para el parche {patchVersion}.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Toggle de Auto-Importar */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#040C1A] px-3 py-2 rounded border border-[#1B3B6F] hover:border-[#00D4FF]/60 transition">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                onChange={(e) => setAutoImportEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#00D4FF] rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-[#A8C8F0] tracking-wider">
                Auto-Importar a LoL
              </span>
            </label>

            <button
              onClick={() => fetchAdvice()}
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-[#00D4FF] to-[#0077FF] hover:from-[#00F0FF] hover:to-[#0088FF] disabled:opacity-50 text-[#030813] font-black text-xs uppercase tracking-widest rounded shadow-[0_0_18px_rgba(0,212,255,0.4)] transition-all flex items-center justify-center space-x-2 transform -skew-x-6 active:scale-95"
            >
              <div className="transform skew-x-6 flex items-center space-x-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-[#030813]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>ANALIZANDO...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-[#030813]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>ANALIZAR MATCHUP</span>
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Notificación de Estado de Inyección */}
        {importMsg && (
          <div
            className={`mt-4 p-3 rounded text-xs font-bold flex items-center space-x-2 border transition-all ${
              importStatus === 'success'
                ? 'bg-[#00FFB2]/15 border-[#00FFB2]/60 text-[#00FFB2]'
                : importStatus === 'error'
                ? 'bg-[#FF2E63]/15 border-[#FF2E63]/60 text-[#FF2E63]'
                : 'bg-[#00D4FF]/15 border-[#00D4FF]/60 text-[#00D4FF]'
            }`}
          >
            <span className="text-sm">
              {importStatus === 'success' ? '⚡' : importStatus === 'error' ? '❌' : '⏳'}
            </span>
            <span>{importMsg}</span>
          </div>
        )}

        {/* Selector de Parámetros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-[#1B3B6F]/60">
          <ChampionSelectInput
            label="Mi Campeón"
            value={championId}
            onChange={setChampionId}
            patchVersion={patchVersion}
          />

          <ChampionSelectInput
            label="Campeón Rival (Predicho / Bloqueado)"
            value={opponentId}
            onChange={setOpponentId}
            patchVersion={patchVersion}
          />

          <div>
            <label className="text-xs text-[#6F92BF] font-mono uppercase tracking-wider block mb-1">
              Posición Asignada
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-[#040C1A] border border-[#1B3B6F] rounded px-3 py-2 text-sm text-white font-semibold focus:outline-none focus:border-[#00D4FF]"
            >
              <option value="TOP">TOP (Superior)</option>
              <option value="JUNGLE">JUNGLE (Jungla)</option>
              <option value="MIDDLE">MIDDLE (Central)</option>
              <option value="BOTTOM">BOTTOM (Tirador)</option>
              <option value="UTILITY">UTILITY (Soporte)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#FF2E63]/15 border border-[#FF2E63]/50 p-4 rounded-xl text-xs text-[#FF85A2] font-mono">
          <strong>ERROR DE ANÁLISIS:</strong> {error}
        </div>
      )}

      {/* Resultados de la Recomendación */}
      {recommendation ? (
        <div className="space-y-6">
          {/* Tarjeta de Dificultad, Resumen y Botón de Inyección */}
          <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {/* Header visual del Enfrentamiento */}
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b border-[#1B3B6F]/70">
              <div className="flex items-center space-x-3 bg-[#040C1A] px-3.5 py-2 rounded border border-[#00D4FF]/40 shadow-[0_0_12px_rgba(0,212,255,0.2)]">
                <img
                  src={getChampionIconUrl(recommendation.championId, patchVersion)}
                  alt={getChampionName(recommendation.championId)}
                  className="w-8 h-8 rounded object-cover border border-[#00D4FF]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#00D4FF] font-mono font-bold uppercase block">MI ELECCIÓN</span>
                  <span className="font-black text-white text-sm">
                    {getChampionName(recommendation.championId)}
                  </span>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-[#061021] border border-[#1B3B6F] flex items-center justify-center font-black text-xs text-[#5078A8]">
                VS
              </div>

              <div className="flex items-center space-x-3 bg-[#040C1A] px-3.5 py-2 rounded border border-[#FF2E63]/40 shadow-[0_0_12px_rgba(255,46,99,0.2)]">
                <img
                  src={getChampionIconUrl(recommendation.opponentChampionId, patchVersion)}
                  alt={getChampionName(recommendation.opponentChampionId)}
                  className="w-8 h-8 rounded object-cover border border-[#FF2E63]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <span className="text-[10px] text-[#FF2E63] font-mono font-bold uppercase block">RIVAL EN LÍNEA</span>
                  <span className="font-black text-white text-sm">
                    {getChampionName(recommendation.opponentChampionId)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-[#6F92BF] uppercase tracking-wider">
                  DIFICULTAD ESTIMADA DE LÍNEA
                </span>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {recommendation.difficultyRating}
                    <span className="text-base text-[#5078A8] font-normal"> / 10</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-black tracking-wider ${
                      getDifficultyColor(recommendation.difficultyRating).text
                    } bg-[#040C1A] border border-current`}
                  >
                    {getDifficultyColor(recommendation.difficultyRating).label}
                  </span>
                </div>
              </div>

              {/* Botón Maestro: Importar Runas y Build a LoL */}
              <button
                onClick={() => aplicarRunasYBuild(recommendation)}
                disabled={importStatus === 'importing'}
                className="px-5 py-3 rounded bg-gradient-to-r from-[#00D4FF] via-[#0088FF] to-[#0055FF] hover:from-[#00F0FF] hover:to-[#0066FF] text-[#030813] font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(0,212,255,0.5)] transition-all flex items-center space-x-2.5 transform -skew-x-6 active:scale-95"
              >
                <div className="transform skew-x-6 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-[#030813]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>
                    {importStatus === 'importing'
                      ? 'IMPORTANDO A LOL...'
                      : 'IMPORTAR RUNAS & BUILD A LOL'}
                  </span>
                </div>
              </button>
            </div>

            {/* Barra visual de dificultad */}
            <div className="w-full bg-[#040C1A] rounded-full h-2 mb-5 overflow-hidden border border-[#1B3B6F]">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${
                  getDifficultyColor(recommendation.difficultyRating).bg
                }`}
                style={{ width: `${recommendation.difficultyRating * 10}%` }}
              ></div>
            </div>

            {/* Resumen */}
            <div className="bg-[#040C1A]/80 p-4 rounded border border-[#1B3B6F]/80">
              <h4 className="text-xs font-mono font-bold text-[#00D4FF] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 bg-[#00D4FF] rounded-full" />
                <span>DINÁMICA DEL ENFRENTAMIENTO</span>
              </h4>
              <p className="text-xs text-[#C8DCF5] leading-relaxed">
                {recommendation.matchupSummary}
              </p>
            </div>
          </div>

          {/* Runas Recomendadas */}
          <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1B3B6F]/60">
              <h3 className="text-sm font-black text-white flex items-center space-x-2 tracking-wide">
                <span className="w-2 h-2 rounded-full bg-[#00D4FF] shadow-[0_0_8px_#00D4FF]"></span>
                <span className="uppercase">Configuración de Runas Oficial (Temporada 14)</span>
              </h3>
              <span className="text-xs text-[#00D4FF] font-mono font-bold">
                Ramas: {recommendation.runesRecommendation.primaryStyleId} + {recommendation.runesRecommendation.subStyleId}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#040C1A] p-4 rounded border border-[#1B3B6F]">
                <span className="text-[11px] font-mono text-[#6F92BF] uppercase tracking-wider block mb-2.5">
                  9 Perks Seleccionados (Sin Fragmentos Obsoletos)
                </span>
                <div className="flex flex-wrap gap-2">
                  {recommendation.runesRecommendation.selectedPerkIds.map((perkId, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-[#091830] border border-[#1B3B6F] text-[#00F0FF] rounded text-xs font-mono font-bold"
                    >
                      {perkId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#040C1A] p-4 rounded border border-[#1B3B6F] flex flex-col justify-center">
                <span className="text-[11px] font-mono text-[#00D4FF] uppercase tracking-wider block mb-1">
                  Justificación Táctica
                </span>
                <p className="text-xs text-[#C8DCF5] leading-relaxed">
                  {recommendation.runesRecommendation.rationale}
                </p>
              </div>
            </div>
          </div>

          {/* Visualizador de Build de Objetos in-game y Orden de Habilidades */}
          <BuildVisualizer
            build={recommendation.buildRecommendation}
            skillOrder={recommendation.skillOrder}
            patch={patchVersion}
          />

          {/* Estrategia de Early Game y Amenazas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Early Game Plan */}
            <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <h3 className="text-xs font-mono font-black text-[#FFD700] uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#FFD700] shadow-[0_0_8px_#FFD700]"></span>
                <span>Plan de Fase de Líneas (Early Game)</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#6F92BF] font-mono font-bold uppercase block">Control de Oleadas:</span>
                  <p className="text-[#C8DCF5] mt-0.5">{recommendation.earlyGameStrategy.waveManagement}</p>
                </div>
                <div>
                  <span className="text-[#6F92BF] font-mono font-bold uppercase block">Intercambios (Tradeos):</span>
                  <p className="text-[#C8DCF5] mt-0.5">{recommendation.earlyGameStrategy.tradingPlan}</p>
                </div>
                <div>
                  <span className="text-[#6F92BF] font-mono font-bold uppercase block mb-1">Picos de Nivel:</span>
                  <ul className="list-disc list-inside text-[#C8DCF5] space-y-0.5">
                    {recommendation.earlyGameStrategy.levelSpikes.map((spike, idx) => (
                      <li key={idx}>{spike}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Análisis de Amenazas y Condición de Victoria */}
            <div className="bg-[#08152B]/95 border border-[#1B3B6F] rounded-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <h3 className="text-xs font-mono font-black text-[#FF2E63] uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#FF2E63] shadow-[0_0_8px_#FF2E63]"></span>
                <span>Amenazas Críticas y Condición de Victoria</span>
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-[#6F92BF] font-mono font-bold uppercase block mb-1">Amenazas Principales:</span>
                  <ul className="list-disc list-inside text-[#FF85A2] space-y-1">
                    {recommendation.threatAnalysis.enemyThreats.map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#040C1A] p-3 rounded border border-[#00D4FF]/30">
                  <span className="text-[#00D4FF] font-mono font-bold uppercase block mb-1">Condición de Victoria:</span>
                  <p className="text-[#C8DCF5]">{recommendation.threatAnalysis.winCondition}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[#08152B]/50 border border-[#1B3B6F]/60 rounded-xl">
          <svg className="w-12 h-12 text-[#5078A8] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-[#6F92BF] text-sm">
            En Selección de Campeón, las runas y la build se generarán y aplicarán <strong className="text-[#00D4FF]">automáticamente</strong> sin que tengas que configurarlas manualmente.
          </p>
        </div>
      )}
    </div>
  );
};
