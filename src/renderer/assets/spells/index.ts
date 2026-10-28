import flashIcon from './SummonerFlash.png';
import teleportIcon from './SummonerTeleport.png';
import dotIcon from './SummonerDot.png';
import smiteIcon from './SummonerSmite.png';
import healIcon from './SummonerHeal.png';
import barrierIcon from './SummonerBarrier.png';
import exhaustIcon from './SummonerExhaust.png';
import hasteIcon from './SummonerHaste.png';
import boostIcon from './SummonerBoost.png';

export const LOCAL_SPELL_ICONS: Record<number, string> = {
  4: flashIcon,
  12: teleportIcon,
  14: dotIcon,
  11: smiteIcon,
  7: healIcon,
  21: barrierIcon,
  3: exhaustIcon,
  6: hasteIcon,
  1: boostIcon,
};

export function getLocalSpellIcon(id: number): string {
  return LOCAL_SPELL_ICONS[id] || flashIcon;
}
