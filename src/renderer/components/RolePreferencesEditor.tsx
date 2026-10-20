import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Role, AppSettings } from '../../shared/types';
import {
  obtenerTodosLosCampeones,
  getChampionName,
  getChampionIconUrl,
  ChampionInfo
} from '../../shared/champions';
import {
  COMMON_SUMMONER_SPELLS,
  getSummonerSpellName,
  getSummonerSpellIconUrl,
  SummonerSpellInfo
} from '../../shared/summonerSpells';
import {
  Shield,
  Trees,
  Zap,
  Crosshair,
  Heart,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Clock,
  Check,
  Flame,
  AlertCircle
} from 'lucide-react';

interface RolePreferencesEditorProps {
  settings: AppSettings['autoChampSelect'];
  onSave: (updated: AppSettings['autoChampSelect']) => void;
  disabled?: boolean;
}

const ROLES: Array<{ id: Role; label: string; icon: React.ReactNode }> = [
  { id: 'TOP', label: 'Superior (Top)', icon: <Shield className="w-3.5 h-3.5 text-rose-400" /> },
  { id: 'JUNGLE', label: 'Jungla (Jungle)', icon: <Trees className="w-3.5 h-3.5 text-emerald-400" /> },
  { id: 'MIDDLE', label: 'Central (Mid)', icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> },
  { id: 'BOTTOM', label: 'Tirador (ADC)', icon: <Crosshair className="w-3.5 h-3.5 text-cyan-400" /> },
  { id: 'UTILITY', label: 'Soporte (Support)', icon: <Heart className="w-3.5 h-3.5 text-purple-400" /> }
];

export const RolePreferencesEditor: React.FC<RolePreferencesEditorProps> = ({
  settings,
  onSave,
  disabled = false
}) => {
  const [selectedRole, setSelectedRole] = useState<Role>('TOP');
  const [prefs, setPrefs] = useState<AppSettings['autoChampSelect']>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Catálogo completo de campeones
  const allChampions = useMemo(() => obtenerTodosLosCampeones(), []);

  // Sincronizar si cambian las props
  useEffect(() => {
    setPrefs(settings);
  }, [settings]);

  const currentRolePref = prefs.rolePreferences[selectedRole] || {
    preferredChampions: [],
    fallbackChampions: [],
    banChampions: [],
    spells: [4, 14] as [number, number]
  };

  const handleUpdateCurrentRole = (updatedFields: Partial<typeof currentRolePref>) => {
    const updated = {
      ...prefs,
      rolePreferences: {
        ...prefs.rolePreferences,
        [selectedRole]: {
          ...currentRolePref,
          ...updatedFields
        }
      }
    };
    setPrefs(updated);
  };

  const handleToggleAutoAction = (key: 'autoHover' | 'autoPick' | 'autoBan' | 'autoSpells') => {
    const updated = {
      ...prefs,
      [key]: !prefs[key]
    };
    setPrefs(updated);
  };

  const handlePickDelayChange = (seconds: number) => {
    const clamped = Math.max(0, Math.min(5, seconds));
    setPrefs({
      ...prefs,
      pickDelaySeconds: clamped
    });
  };

  const handleSave = () => {
    onSave(prefs);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // ==========================================
  // Manejador de lista reordenable / eliminar / agregar
  // ==========================================
  const handleAddChampion = (
    listType: 'preferredChampions' | 'fallbackChampions' | 'banChampions',
    champId: number
  ) => {
    const currentList = currentRolePref[listType] || [];
    if (!currentList.includes(champId)) {
      handleUpdateCurrentRole({
        [listType]: [...currentList, champId]
      });
    }
  };

  const handleRemoveChampion = (
    listType: 'preferredChampions' | 'fallbackChampions' | 'banChampions',
    champId: number
  ) => {
    const currentList = currentRolePref[listType] || [];
    handleUpdateCurrentRole({
      [listType]: currentList.filter((id) => id !== champId)
    });
  };

  const handleMoveChampion = (
    listType: 'preferredChampions' | 'fallbackChampions' | 'banChampions',
    index: number,
    direction: 'up' | 'down'
  ) => {
    const currentList = [...(currentRolePref[listType] || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    const temp = currentList[index];
    currentList[index] = currentList[targetIndex];
    currentList[targetIndex] = temp;

    handleUpdateCurrentRole({
      [listType]: currentList
    });
  };

  // ==========================================
  // Componente Buscador Autocompletado de Campeones
  // ==========================================
  const ChampionAutocomplete: React.FC<{
    listType: 'preferredChampions' | 'fallbackChampions' | 'banChampions';
    placeholder: string;
    existingIds: number[];
  }> = ({ listType, placeholder, existingIds }) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
      if (!search.trim()) return [];
      const query = search.toLowerCase().trim();
      return allChampions
        .filter(
          (c) =>
            !existingIds.includes(c.id) &&
            (c.name.toLowerCase().includes(query) ||
              c.key.toLowerCase().includes(query) ||
              String(c.id).includes(query))
        )
        .slice(0, 8);
    }, [search, existingIds]);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={containerRef}>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-[#0A1428] border border-[#1E282D] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#00D4FF] transition"
          />
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && filtered.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0A1428] border border-[#00D4FF]/40 rounded-lg shadow-2xl max-h-48 overflow-y-auto divide-y divide-neutral-800">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  handleAddChampion(listType, c.id);
                  setSearch('');
                  setOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-left hover:bg-[#111A24] transition"
              >
                <img
                  src={getChampionIconUrl(c.id)}
                  alt={c.name}
                  className="w-6 h-6 rounded-full border border-neutral-700 object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{c.name}</div>
                  <div className="text-[10px] text-neutral-400 font-mono">ID: {c.id}</div>
                </div>
                <span className="text-[10px] text-[#00D4FF] font-medium">+ Agregar</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // Renderizado de Chips Reordenables con Prioridad
  // ==========================================
  const renderReorderableChips = (
    listType: 'preferredChampions' | 'fallbackChampions' | 'banChampions',
    ids: number[]
  ) => {
    if (!ids || ids.length === 0) {
      return (
        <div className="py-2 text-[11px] text-neutral-500 italic text-center border border-dashed border-neutral-800 rounded-lg mt-1.5">
          Ningún campeón asignado. Agrega uno con el buscador superior.
        </div>
      );
    }

    return (
      <div className="space-y-1.5 mt-2">
        {ids.map((id, index) => {
          const name = getChampionName(id);
          const icon = getChampionIconUrl(id);
          const isFirst = index === 0;
          const isLast = index === ids.length - 1;

          return (
            <div
              key={id}
              className="flex items-center justify-between bg-[#0E1626] border border-[#1E282D] hover:border-[#00D4FF]/50 px-2.5 py-1.5 rounded-lg text-xs transition group"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold ${
                    index === 0
                      ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  #{index + 1}
                </span>

                <img
                  src={icon}
                  alt={name}
                  className="w-6 h-6 rounded-full border border-neutral-700 object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />

                <div className="truncate">
                  <span className="text-white font-semibold truncate">{name}</span>
                  <span className="text-[10px] text-neutral-500 font-mono ml-1.5">({id})</span>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                {/* Botón Subir Prioridad */}
                <button
                  type="button"
                  onClick={() => handleMoveChampion(listType, index, 'up')}
                  disabled={isFirst || disabled}
                  title="Subir prioridad"
                  className="p-1 text-neutral-400 hover:text-white disabled:opacity-20 hover:bg-neutral-800 rounded transition"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>

                {/* Botón Bajar Prioridad */}
                <button
                  type="button"
                  onClick={() => handleMoveChampion(listType, index, 'down')}
                  disabled={isLast || disabled}
                  title="Bajar prioridad"
                  className="p-1 text-neutral-400 hover:text-white disabled:opacity-20 hover:bg-neutral-800 rounded transition"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Botón Quitar */}
                <button
                  type="button"
                  onClick={() => handleRemoveChampion(listType, id)}
                  disabled={disabled}
                  title="Quitar"
                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==========================================
  // Selector de Hechizos de Invocador con Icono y Nombre
  // ==========================================
  const SpellSelector: React.FC<{
    slot: 0 | 1;
    label: string;
    currentId: number;
  }> = ({ slot, label, currentId }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentSpell = COMMON_SUMMONER_SPELLS.find((s) => s.id === currentId) || {
      id: currentId,
      key: 'unknown',
      name: getSummonerSpellName(currentId),
      icon: getSummonerSpellIconUrl(currentId)
    };

    useEffect(() => {
      const handleClick = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (spell: SummonerSpellInfo) => {
      const newSpells: [number, number] =
        slot === 0
          ? [spell.id, currentRolePref.spells[1]]
          : [currentRolePref.spells[0], spell.id];
      handleUpdateCurrentRole({ spells: newSpells });
      setDropdownOpen(false);
    };

    return (
      <div className="relative flex-1" ref={ref}>
        <div className="text-[10px] text-neutral-400 font-mono uppercase mb-1">
          {label} (Tecla {slot === 0 ? 'D' : 'F'})
        </div>

        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={disabled}
          className="w-full flex items-center justify-between bg-[#0A1428] border border-[#1E282D] hover:border-[#00D4FF]/40 rounded-lg p-2 text-xs transition"
        >
          <div className="flex items-center space-x-2 truncate">
            <img
              src={currentSpell.icon}
              alt={currentSpell.name}
              className="w-6 h-6 rounded border border-neutral-700 object-cover shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://ddragon.leagueoflegends.com/cdn/14.20.1/img/spell/SummonerFlash.png';
              }}
            />
            <span className="text-white font-medium truncate">{currentSpell.name}</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0 ml-1" />
        </button>

        {dropdownOpen && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0A1428] border border-[#00D4FF]/50 rounded-lg shadow-2xl max-h-56 overflow-y-auto divide-y divide-neutral-800">
            {COMMON_SUMMONER_SPELLS.map((spell) => (
              <button
                key={spell.id}
                type="button"
                onClick={() => handleSelect(spell)}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 text-left hover:bg-[#111A24] transition ${
                  spell.id === currentId ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'text-white'
                }`}
              >
                <img
                  src={spell.icon}
                  alt={spell.name}
                  className="w-5 h-5 rounded border border-neutral-700 object-cover"
                />
                <span className="text-xs font-medium flex-1">{spell.name}</span>
                {spell.id === currentId && <Check className="w-3.5 h-3.5 text-[#00D4FF]" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#0B121E] border border-[#1E355B] rounded-xl p-5 shadow-2xl space-y-6">
      {/* Cabecera P3R */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E355B]/80 pb-4">
        <div>
          <div className="inline-block px-2.5 py-0.5 mb-1 bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00F0FF] text-[10px] font-black tracking-widest uppercase transform -skew-x-6">
            CHAMP SELECT AUTO-PILOT // LOCK-IN REAL
          </div>
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>Automatización de Champ Select y Preferencias por Rol</span>
          </h3>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Configuración por nombres y avatares con bloqueo automático real en cliente (LCU API).
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={disabled}
          className="flex items-center space-x-2 bg-gradient-to-r from-[#00D4FF] to-[#0088FF] hover:from-[#00F0FF] hover:to-[#0077FF] disabled:opacity-50 text-[#030813] font-black text-xs uppercase tracking-widest px-4 py-2 rounded shadow-[0_0_15px_rgba(0,212,255,0.4)] transition transform -skew-x-6 active:scale-95 self-start sm:self-auto"
        >
          <div className="transform skew-x-6 flex items-center space-x-1.5">
            {savedSuccess ? <Check className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
            <span>{savedSuccess ? '¡GUARDADO!' : 'GUARDAR PREFERENCIAS'}</span>
          </div>
        </button>
      </div>

      {/* Toggles Globales de Automatización */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#070D19] p-3.5 rounded-lg border border-[#1E282D]">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.autoHover}
            onChange={() => handleToggleAutoAction('autoHover')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-[#00D4FF] focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-200 font-medium">Auto Hover (Intención)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.autoPick}
            onChange={() => handleToggleAutoAction('autoPick')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-[#00D4FF] focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-200 font-medium">Auto Pick (Lock-In Real)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.autoBan}
            onChange={() => handleToggleAutoAction('autoBan')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-[#00D4FF] focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-200 font-medium">Auto Ban (Bloqueo)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.autoSpells}
            onChange={() => handleToggleAutoAction('autoSpells')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-[#00D4FF] focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-200 font-medium">Auto Spells (Hechizos)</span>
        </label>
      </div>

      {/* Retardo de Bloqueo (Pick Delay) */}
      <div className="bg-[#070D19] p-3 rounded-lg border border-[#1E282D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <Clock className="w-4 h-4 text-[#00D4FF]" />
          <div>
            <div className="text-xs text-white font-semibold">
              Retardo de confirmación (Lock-in Delay):{' '}
              <span className="font-mono text-[#00D4FF] font-bold">
                {prefs.pickDelaySeconds ?? 1} segundos
              </span>
            </div>
            <div className="text-[11px] text-neutral-400">
              Tiempo de espera antes de completar el pick para permitirte cancelar o cambiar de opinión.
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-48">
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={prefs.pickDelaySeconds ?? 1}
            onChange={(e) => handlePickDelayChange(Number(e.target.value))}
            disabled={disabled}
            className="w-full accent-[#00D4FF] cursor-pointer"
          />
          <span className="text-xs font-mono text-white font-bold w-6 text-right">
            {prefs.pickDelaySeconds ?? 1}s
          </span>
        </div>
      </div>

      {/* Selector de Pestaña de Rol */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRole(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              selectedRole === r.id
                ? 'bg-[#00D4FF]/20 text-[#00F0FF] border border-[#00D4FF]/60 shadow-[0_0_12px_rgba(0,212,255,0.25)]'
                : 'bg-[#0A1428] text-neutral-400 hover:text-white border border-[#1E282D]'
            }`}
          >
            <span>{r.icon}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Formulario de Configuración del Rol Seleccionado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-[#070D19]/80 p-4 rounded-xl border border-[#1E282D]">
        {/* Columna 1: Campeones Preferidos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00D4FF]" />
              <span>Campeones Preferidos (En orden de prioridad)</span>
            </label>
            <span className="text-[10px] text-neutral-400 font-mono">
              {currentRolePref.preferredChampions.length} seleccionados
            </span>
          </div>
          <ChampionAutocomplete
            listType="preferredChampions"
            placeholder="Buscar por nombre (ej: Caitlyn, Ashe, Jinx)..."
            existingIds={currentRolePref.preferredChampions}
          />
          {renderReorderableChips('preferredChampions', currentRolePref.preferredChampions)}
          <p className="text-[10px] text-neutral-400">
            Itero Local elegirá y bloqueará el primero de la lista que no esté baneado ni pickeado.
          </p>
        </div>

        {/* Columna 2: Campeones de Respaldo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Campeones de Respaldo (Fallback)</span>
            </label>
            <span className="text-[10px] text-neutral-400 font-mono">
              {currentRolePref.fallbackChampions.length} seleccionados
            </span>
          </div>
          <ChampionAutocomplete
            listType="fallbackChampions"
            placeholder="Buscar campeones secundarios..."
            existingIds={currentRolePref.fallbackChampions}
          />
          {renderReorderableChips('fallbackChampions', currentRolePref.fallbackChampions)}
          <p className="text-[10px] text-neutral-400">
            Se usarán si todos tus campeones preferidos fueron baneados o elegidos.
          </p>
        </div>

        {/* Columna 3: Bans Prioritarios */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Bans Prioritarios</span>
            </label>
            <span className="text-[10px] text-neutral-400 font-mono">
              {currentRolePref.banChampions.length} seleccionados
            </span>
          </div>
          <ChampionAutocomplete
            listType="banChampions"
            placeholder="Buscar campeón a banear (ej: Yasuo, Zed, Blitzcrank)..."
            existingIds={currentRolePref.banChampions}
          />
          {renderReorderableChips('banChampions', currentRolePref.banChampions)}
          <p className="text-[10px] text-neutral-400">
            En tu turno de ban, se bloqueará el primero que no haya sido baneado previamente.
          </p>
        </div>

        {/* Columna 4: Hechizos de Invocador */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>Hechizos de Invocador</span>
            </label>
            <span className="text-[10px] text-neutral-400 font-mono">
              D & F por Rol
            </span>
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <SpellSelector
              slot={0}
              label="Hechizo Primario"
              currentId={currentRolePref.spells[0]}
            />
            <SpellSelector
              slot={1}
              label="Hechizo Secundario"
              currentId={currentRolePref.spells[1]}
            />
          </div>

          <div className="bg-[#0A1428] p-2.5 rounded-lg border border-[#1E282D] text-[11px] text-neutral-400 flex items-start space-x-2 mt-2">
            <AlertCircle className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
            <span>
              Al comenzar la fase de selección, estos hechizos se asignarán automáticamente según el rol que te asigne el cliente.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
