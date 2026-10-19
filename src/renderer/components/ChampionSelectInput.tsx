import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { ALL_CHAMPIONS, getChampionById, getChampionIconUrl, ChampionInfo } from '../../shared/champions';

interface ChampionSelectInputProps {
  label: string;
  value: number;
  onChange: (championId: number) => void;
  patchVersion?: string;
  disabled?: boolean;
}

export const ChampionSelectInput: React.FC<ChampionSelectInputProps> = ({
  label,
  value,
  onChange,
  patchVersion = '14.20.1',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedChamp = useMemo(() => getChampionById(value), [value]);

  const filteredChampions = useMemo(() => {
    if (!searchQuery.trim()) {
      return ALL_CHAMPIONS;
    }
    const q = searchQuery.toLowerCase().trim();
    return ALL_CHAMPIONS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-foco en el input de búsqueda
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (champ: ChampionInfo) => {
    onChange(champ.id);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="text-xs text-neutral-400 font-medium block mb-1">
        {label}
      </label>

      {/* Botón trigger principal que muestra el Campeón actual con su icono */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-[#0A111F] border ${
          isOpen ? 'border-[#0070EB] ring-1 ring-[#0070EB]' : 'border-[#1E355B] hover:border-[#2A4878]'
        } rounded px-3 py-2 text-sm text-white focus:outline-none transition-all shadow-sm`}
      >
        <div className="flex items-center space-x-2.5 truncate">
          {selectedChamp ? (
            <>
              <img
                src={getChampionIconUrl(selectedChamp.image, patchVersion)}
                alt={selectedChamp.name}
                className="w-6 h-6 rounded object-cover border border-[#1E355B] flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="font-semibold text-white truncate">{selectedChamp.name}</span>
            </>
          ) : (
            <span className="text-[#64748B]">Seleccionar campeón...</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#94A3B8] transition-transform duration-200 flex-shrink-0 ml-2 ${
            isOpen ? 'rotate-180 text-[#0070EB]' : ''
          }`}
        />
      </button>

      {/* Dropdown flotante con buscador y listado */}
      {isOpen && (
        <div className="absolute z-[100] mt-1.5 w-full min-w-[240px] max-w-[320px] bg-[#0D192D] border border-[#1E355B] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Campo de búsqueda */}
          <div className="p-2 border-b border-[#1E355B] bg-[#0A111F]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar campeón..."
                className="w-full bg-[#0D192D] border border-[#1E355B] rounded pl-8 pr-7 py-1.5 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#0070EB]"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                  } else if (e.key === 'Enter' && filteredChampions.length > 0) {
                    handleSelect(filteredChampions[0]);
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-[#64748B] hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista scrollable de campeones */}
          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5 custom-scrollbar">
            {filteredChampions.length > 0 ? (
              filteredChampions.map((champ) => {
                const isSelected = champ.id === value;
                return (
                  <button
                    key={champ.id}
                    type="button"
                    onClick={() => handleSelect(champ)}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#0070EB]/20 text-white font-semibold border border-[#0070EB]/50'
                        : 'text-[#CBD5E1] hover:bg-[#1E355B]/60 hover:text-white'
                    }`}
                  >
                    <img
                      src={getChampionIconUrl(champ.image, patchVersion)}
                      alt={champ.name}
                      className="w-5 h-5 rounded object-cover border border-[#1E355B] flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="truncate text-left flex-1">{champ.name}</span>
                    {isSelected && (
                      <span className="text-[10px] uppercase font-bold text-[#60A5FA] bg-[#0070EB]/20 px-1.5 py-0.5 rounded border border-[#0070EB]/40">
                        Elegido
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-[#64748B]">
                No se encontró "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
