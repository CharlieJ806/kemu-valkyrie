import { PKMN_ICONS } from "@/data";

/** Icon data URL for a pokemon id (from pokemon-icons.json). */
export function ICON(id: number): string {
  return PKMN_ICONS[String(id)] || "";
}
