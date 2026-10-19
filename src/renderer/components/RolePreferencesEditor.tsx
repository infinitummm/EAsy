import React, { useState } from 'react';
import { Role, AppSettings } from '../../shared/types';
import { getChampionName, getChampionIconUrl } from '../../shared/champions';

interface RolePreferencesEditorProps {
  settings: AppSettings['autoChampSelect'];
  onSave: (updated: AppSettings['autoChampSelect']) => void;
  disabled?: boolean;
}

const ROLES: Array<{ id: Role; label: string; icon: string }> = [
  { id: 'TOP', label: 'Superior (Top)', icon: '🛡️' },
  { id: 'JUNGLE', label: 'Jungla (Jungle)', icon: '🌲' },
  { id: 'MIDDLE', label: 'Central (Mid)', icon: '⚡' },
  { id: 'BOTTOM', label: 'Tirador (ADC)', icon: '🏹' },
  { id: 'UTILITY', label: 'Soporte (Support)', icon: '❤️' }
];

export const RolePreferencesEditor: React.FC<RolePreferencesEditorProps> = ({
  settings,
  onSave,
  disabled = false
}) => {
  const [selectedRole, setSelectedRole] = useState<Role>('TOP');
  const [prefs, setPrefs] = useState<AppSettings['autoChampSelect']>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

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

  const parseIdList = (input: string): number[] => {
    return input
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  };

  const handleSave = () => {
    onSave(prefs);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const renderChampionChips = (ids: number[]) => {
    if (!ids || ids.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {ids.map((id) => (
          <span
            key={id}
            className="inline-flex items-center space-x-1.5 bg-neutral-900 border border-neutral-750 px-2 py-0.5 rounded text-[11px] text-neutral-200"
          >
            <img
              src={getChampionIconUrl(id)}
              alt={getChampionName(id)}
              className="w-3.5 h-3.5 rounded-sm object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span>{getChampionName(id)}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span>Automatización de Champ Select y Preferencias por Rol</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Configura qué campeones elegir, banear y qué hechizos asignar automáticamente según tu posición asignada.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={disabled}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-all shadow-md self-start sm:self-auto"
        >
          {savedSuccess ? '¡Preferencias Guardadas!' : 'Guardar Preferencias'}
        </button>
      </div>

      {/* Toggles Globales de Automatización */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-950/60 p-3.5 rounded-lg border border-neutral-800">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.autoHover}
            onChange={() => handleToggleAutoAction('autoHover')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-cyan-500 focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-300 font-medium">Auto Hover (Intento)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.autoPick}
            onChange={() => handleToggleAutoAction('autoPick')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-cyan-500 focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-300 font-medium">Auto Pick (Elección)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.autoBan}
            onChange={() => handleToggleAutoAction('autoBan')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-cyan-500 focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-300 font-medium">Auto Ban (Bloqueo)</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.autoSpells}
            onChange={() => handleToggleAutoAction('autoSpells')}
            disabled={disabled}
            className="rounded border-neutral-700 bg-neutral-800 text-cyan-500 focus:ring-0 w-4 h-4"
          />
          <span className="text-xs text-neutral-300 font-medium">Auto Spells (Hechizos)</span>
        </label>
      </div>

      {/* Selector de Pestaña de Rol */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRole(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              selectedRole === r.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-transparent'
            }`}
          >
            <span>{r.icon}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Formulario de Configuración del Rol Seleccionado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-neutral-950/40 p-4 rounded-xl border border-neutral-800/80">
        <div>
          <label className="text-xs text-neutral-400 font-medium block mb-1">
            Campeones Preferidos (IDs separados por coma en orden de prioridad)
          </label>
          <input
            type="text"
            value={currentRolePref.preferredChampions.join(', ')}
            onChange={(e) =>
              handleUpdateCurrentRole({ preferredChampions: parseIdList(e.target.value) })
            }
            disabled={disabled}
            placeholder="ej. 266, 24, 84"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
          {renderChampionChips(currentRolePref.preferredChampions)}
          <span className="text-[10px] text-neutral-400 block mt-1">
            El sistema intentará seleccionar el primero disponible.
          </span>
        </div>

        <div>
          <label className="text-xs text-neutral-400 font-medium block mb-1">
            Campeones de Respaldo / Fallback (IDs separados por coma)
          </label>
          <input
            type="text"
            value={currentRolePref.fallbackChampions.join(', ')}
            onChange={(e) =>
              handleUpdateCurrentRole({ fallbackChampions: parseIdList(e.target.value) })
            }
            disabled={disabled}
            placeholder="ej. 517, 39"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
          {renderChampionChips(currentRolePref.fallbackChampions)}
          <span className="text-[10px] text-neutral-400 block mt-1">
            Si los preferidos están baneados o elegidos por otro jugador.
          </span>
        </div>

        <div>
          <label className="text-xs text-neutral-400 font-medium block mb-1">
            Bans Prioritarios (IDs separados por coma)
          </label>
          <input
            type="text"
            value={currentRolePref.banChampions.join(', ')}
            onChange={(e) =>
              handleUpdateCurrentRole({ banChampions: parseIdList(e.target.value) })
            }
            disabled={disabled}
            placeholder="ej. 157, 238"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
          {renderChampionChips(currentRolePref.banChampions)}
        </div>

        <div>
          <label className="text-xs text-neutral-400 font-medium block mb-1">
            Hechizos de Invocador (D / F - IDs numéricos)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={currentRolePref.spells[0]}
              onChange={(e) =>
                handleUpdateCurrentRole({
                  spells: [Number(e.target.value), currentRolePref.spells[1]]
                })
              }
              disabled={disabled}
              className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              placeholder="D (ej. 4 Flash)"
            />
            <input
              type="number"
              value={currentRolePref.spells[1]}
              onChange={(e) =>
                handleUpdateCurrentRole({
                  spells: [currentRolePref.spells[0], Number(e.target.value)]
                })
              }
              disabled={disabled}
              className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              placeholder="F (ej. 14 Teleport/11 Smite)"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
