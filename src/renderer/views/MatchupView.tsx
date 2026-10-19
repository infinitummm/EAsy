import React, { useState } from 'react';
import { GeminiMatchupRecommendation, Role, RunePage } from '../../shared/types';
import { ApplyRunesButton } from '../components/ApplyRunesButton';
import { BuildVisualizer } from '../components/BuildVisualizer';
import { ChampionSelectInput } from '../components/ChampionSelectInput';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';

interface MatchupViewProps {
  initialChampionId?: number;
  initialOpponentId?: number;
  initialRole?: Role;
  patchVersion?: string;
}

export const MatchupView: React.FC<MatchupViewProps> = ({
  initialChampionId = 266, // Aatrox
  initialOpponentId = 24,  // Jax
  initialRole = 'TOP',
  patchVersion = '14.20.1'
}) => {
  const [championId, setChampionId] = useState<number>(initialChampionId);
  const [opponentId, setOpponentId] = useState<number>(initialOpponentId);
  const [role, setRole] = useState<Role>(initialRole);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiMatchupRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAdvice = async () => {
    setLoading(true);
    setError(null);

    try {
      if (window.api && window.api.getMatchupAdvice) {
        const res = await window.api.getMatchupAdvice({
          championId,
          opponentId,
          role,
          patch: patchVersion,
          allies: [],
          enemies: []
        });
        setRecommendation(res);
      } else {
        // Mock fallback para pruebas locales / preview
        setRecommendation({
          championId,
          opponentChampionId: opponentId,
          assignedRole: role,
          patchVersion,
          difficultyRating: 7,
          matchupSummary: 'Enfrentamiento de desgaste. Mantén la distancia con tus habilidades y castiga los tiempos de enfriamiento del rival.',
          runesRecommendation: {
            primaryStyleId: 8000,
            subStyleId: 8400,
            selectedPerkIds: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002],
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
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (diff: number) => {
    if (diff <= 3) return { bg: 'bg-emerald-500', text: 'text-emerald-400', label: 'Favorable' };
    if (diff <= 6) return { bg: 'bg-amber-500', text: 'text-amber-400', label: 'Equilibrado' };
    if (diff <= 8) return { bg: 'bg-orange-500', text: 'text-orange-400', label: 'Desafiante' };
    return { bg: 'bg-rose-500', text: 'text-rose-400', label: 'Muy Difícil' };
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
        selectedPerkIds: [8010, 9111, 9104, 8299, 8446, 8453, 5008, 5008, 5002],
        current: true
      };

  return (
    <div className="space-y-6">
      {/* Cabecera y Parámetros */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span>Análisis de Matchup con Gemini AI</span>
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              Estrategia, runas, build e inteligencia de juego generada para el parche {patchVersion}.
            </p>
          </div>

          <button
            onClick={fetchAdvice}
            disabled={loading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg shadow-md transition-all flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Consultando IA...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Analizar Matchup</span>
              </>
            )}
          </button>
        </div>

        {/* Selector de Parámetros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-neutral-800/80">
          <ChampionSelectInput
            label="Mi Campeón"
            value={championId}
            onChange={setChampionId}
            patchVersion={patchVersion}
          />

          <ChampionSelectInput
            label="Campeón Rival"
            value={opponentId}
            onChange={setOpponentId}
            patchVersion={patchVersion}
          />

          <div>
            <label className="text-xs text-neutral-400 font-medium block mb-1">Rol / Línea</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
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
        <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl text-sm text-rose-300">
          <strong>Error al generar análisis:</strong> {error}
        </div>
      )}

      {/* Resultados de la Recomendación */}
      {recommendation ? (
        <div className="space-y-6">
          {/* Tarjeta de Dificultad y Resumen */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
            {/* Header visual del Enfrentamiento */}
            <div className="flex items-center space-x-3 pb-4 mb-4 border-b border-neutral-800/80">
              <div className="flex items-center space-x-2.5 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
                <img
                  src={getChampionIconUrl(recommendation.championId, patchVersion)}
                  alt={getChampionName(recommendation.championId)}
                  className="w-7 h-7 rounded-md object-cover border border-indigo-500/50"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-white text-sm">
                  {getChampionName(recommendation.championId)}
                </span>
              </div>
              <span className="text-xs uppercase font-extrabold text-neutral-500 tracking-wider">
                VS
              </span>
              <div className="flex items-center space-x-2.5 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
                <img
                  src={getChampionIconUrl(recommendation.opponentChampionId, patchVersion)}
                  alt={getChampionName(recommendation.opponentChampionId)}
                  className="w-7 h-7 rounded-md object-cover border border-rose-500/50"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-white text-sm">
                  {getChampionName(recommendation.opponentChampionId)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Dificultad Estimada de la Línea
                </span>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-3xl font-extrabold text-white">
                    {recommendation.difficultyRating}
                    <span className="text-base text-neutral-500 font-normal"> / 10</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      getDifficultyColor(recommendation.difficultyRating).text
                    } bg-neutral-800 border border-neutral-700`}
                  >
                    {getDifficultyColor(recommendation.difficultyRating).label}
                  </span>
                </div>
              </div>

              {/* Botón para inyectar runas directamente */}
              <ApplyRunesButton page={currentRunePage} />
            </div>

            {/* Barra visual de dificultad */}
            <div className="w-full bg-neutral-800 rounded-full h-2.5 mb-5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  getDifficultyColor(recommendation.difficultyRating).bg
                }`}
                style={{ width: `${recommendation.difficultyRating * 10}%` }}
              ></div>
            </div>

            {/* Resumen */}
            <div className="bg-neutral-950/60 p-4 rounded-lg border border-neutral-800/80">
              <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                Dinámica del Matchup
              </h4>
              <p className="text-sm text-neutral-300 leading-relaxed">
                {recommendation.matchupSummary}
              </p>
            </div>
          </div>

          {/* Runas Recomendadas */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Configuración de Runas Óptima</span>
              </h3>
              <span className="text-xs text-neutral-400 font-mono">
                Rama: {recommendation.runesRecommendation.primaryStyleId} + {recommendation.runesRecommendation.subStyleId}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-950/50 p-4 rounded-lg border border-neutral-800">
                <span className="text-xs text-neutral-400 font-medium block mb-2">9 Perks Seleccionados</span>
                <div className="flex flex-wrap gap-2">
                  {recommendation.runesRecommendation.selectedPerkIds.map((perkId, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono text-neutral-200"
                    >
                      {perkId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-neutral-950/50 p-4 rounded-lg border border-neutral-800 flex flex-col justify-center">
                <span className="text-xs text-neutral-400 font-medium block mb-1">Justificación Táctica</span>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {recommendation.runesRecommendation.rationale}
                </p>
              </div>
            </div>
          </div>

          {/* Visualizador de Build y Habilidades */}
          <BuildVisualizer
            build={recommendation.buildRecommendation}
            skillOrder={recommendation.skillOrder}
            patch={patchVersion}
          />

          {/* Estrategia de Early Game y Amenazas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Early Game Plan */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Plan de Early Game</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-neutral-400 font-semibold block">Control de Oleadas:</span>
                  <p className="text-neutral-300 mt-0.5">{recommendation.earlyGameStrategy.waveManagement}</p>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block">Plan de Tradeos:</span>
                  <p className="text-neutral-300 mt-0.5">{recommendation.earlyGameStrategy.tradingPlan}</p>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block mb-1">Picos de Nivel:</span>
                  <ul className="list-disc list-inside text-neutral-300 space-y-0.5">
                    {recommendation.earlyGameStrategy.levelSpikes.map((spike, idx) => (
                      <li key={idx}>{spike}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Análisis de Amenazas y Condición de Victoria */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Amenazas y Condición de Victoria</span>
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-neutral-400 font-semibold block mb-1">Amenazas Principales:</span>
                  <ul className="list-disc list-inside text-neutral-300 space-y-1">
                    {recommendation.threatAnalysis.enemyThreats.map((threat, idx) => (
                      <li key={idx}>{threat}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-900/50">
                  <span className="text-indigo-300 font-semibold block mb-1">Condición de Victoria:</span>
                  <p className="text-neutral-300">{recommendation.threatAnalysis.winCondition}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-neutral-900/40 border border-neutral-800/60 rounded-xl">
          <svg className="w-12 h-12 text-neutral-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-neutral-400 text-sm">
            Haz clic en <strong>Analizar Matchup</strong> para obtener la estrategia completa generada por IA.
          </p>
        </div>
      )}
    </div>
  );
};
