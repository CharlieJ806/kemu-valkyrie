import pokemonData from "./pokemon.json";
import questionsData from "./questions.json";
import pkmnIconsData from "./pokemon-icons.json";
import bstData from "./bst.json";
import gameRulesData from "./game_rules.json";
import { GAME_CONST } from "./constants";

export type Rarity = "c" | "u" | "r" | "l";

export type Pokemon = {
  id: number;
  n: string;
  c: string;
  r: Rarity;
  i: number;
};

export type Question = {
  id: string;
  q: string;
  opts: string[];
  ans: number;
};

export type GameRules = {
  rarity_labels: Record<Rarity, string>;
  rarity_colors: Record<Rarity, string>;
  hp_formula: string;
  rarity_hp_mult: Record<Rarity, number>;
  speed_base: string;
  rarity_speed_mult: Record<Rarity, number>;
  icon_fallback_colors: string[];
};

export const POKEMON = pokemonData as Pokemon[];
export const QUESTIONS = questionsData as Question[];
export const PKMN_ICONS = pkmnIconsData as Record<string, string>;
export const PKM_BST = bstData as Record<string, number | null>;
export const GAME_RULES = gameRulesData as GameRules;
export { GAME_CONST };

export {
  TIER1_LEGEND,
  TIER2_LEGEND,
  MYTHICAL_PKMN,
  DEFAULT_POKEMON_ID,
  SPAWN_INTERVAL,
  SPAWN_MAX,
  MAX_UPGRADE_LEVEL,
  BANK_PAGE_SIZE,
  MAX_MONSTERS,
} from "./constants";
