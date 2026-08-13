import type {
  Card,
  CardDef,
  CardFx,
  EnemyStatus,
  StatusType,
} from "./types";

/* ============ 战斗上下文(applyCardFx 操作的可变对象) ============ */

export type BattleCtx = {
  enemyHp: number;
  enemyMaxHp: number;
  enemyBlock: number;
  block: number;
  hp: number;
  maxHp: number;
  energy: number;
  playerDmgMult: number;
  playerDefMult: number;
  enemyAtkMult: number;
  enemyStatus: EnemyStatus | null;
  atk: number;
  draw: (n: number) => void;
};

export type CardFxEvent =
  | { type: "dmg"; amount: number; blocked: number }
  | { type: "block"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "selfDmg"; amount: number }
  | { type: "energy"; amount: number }
  | { type: "status"; status: StatusType }
  | { type: "mult"; mult: number }
  | { type: "weak"; amount: number }
  | { type: "draw"; n: number };

const STATUS_NAMES: Record<StatusType, string> = {
  burn: "灼烧",
  para: "麻痹",
  poison: "中毒",
  sleep: "催眠",
  freeze: "冰冻",
  confuse: "混乱",
};

/* ============ 卡牌定义(迁移自 standalone battle.js §3) ============ */

export const ALL_CARDS: CardDef[] = [
  // ═══ 攻击系 atk ═══
  { id: "tackle", name: "撞击", type: "atk", cost: 1, icon: "👊", desc: "造成6点伤害", rarity: "c", cat: "atk", power: 1, fx: { dmg: 6 } },
  { id: "ember", name: "火花", type: "atk", cost: 1, icon: "🔥", desc: "造成5点伤害，30%灼烧2回合", rarity: "c", cat: "atk", power: 1, fx: { dmg: 5, status: "burn", statusChance: 0.3, statusTurns: 2 } },
  { id: "quick_attack", name: "电光一闪", type: "atk", cost: 0, icon: "💨", desc: "造成4点伤害（0费）", rarity: "c", cat: "atk", power: 1, fx: { dmg: 4 } },
  { id: "aqua_jet", name: "水流喷射", type: "atk", cost: 1, icon: "💧", desc: "造成7点伤害", rarity: "c", cat: "atk", power: 1, fx: { dmg: 7 } },
  { id: "bullet_punch", name: "子弹拳", type: "atk", cost: 1, icon: "🔩", desc: "造成6点伤害", rarity: "c", cat: "atk", power: 1, fx: { dmg: 6 } },
  { id: "thunder_shock", name: "电击", type: "atk", cost: 1, icon: "⚡", desc: "造成5点伤害，20%麻痹1回合", rarity: "c", cat: "atk", power: 1, fx: { dmg: 5, status: "para", statusChance: 0.2, statusTurns: 1 } },
  { id: "water_gun", name: "水枪", type: "atk", cost: 1, icon: "💧", desc: "造成6点伤害", rarity: "c", cat: "atk", power: 1, fx: { dmg: 6 } },
  { id: "razor_leaf", name: "飞叶快刀", type: "atk", cost: 1, icon: "🍃", desc: "造成7点伤害", rarity: "c", cat: "atk", power: 1, fx: { dmg: 7 } },
  { id: "double_kick", name: "二连踢", type: "atk", cost: 1, icon: "👟", desc: "造成4点伤害×2", rarity: "u", cat: "atk", power: 2, fx: { dmg: 4, hits: 2 } },
  { id: "flame_thrower", name: "喷射火焰", type: "atk", cost: 2, icon: "🔥", desc: "造成14点伤害，40%灼烧2回合", rarity: "u", cat: "atk", power: 2, fx: { dmg: 14, status: "burn", statusChance: 0.4, statusTurns: 2 } },
  { id: "thunderbolt", name: "十万伏特", type: "atk", cost: 2, icon: "⚡", desc: "造成14点伤害，无视部分格挡", rarity: "u", cat: "atk", power: 2, fx: { dmg: 14, pierce: 0.5 } },
  { id: "ice_beam", name: "冰冻光束", type: "atk", cost: 2, icon: "❄️", desc: "造成13点伤害，35%冰冻1回合", rarity: "u", cat: "atk", power: 2, fx: { dmg: 13, status: "freeze", statusChance: 0.35, statusTurns: 1 } },
  { id: "psychic", name: "精神强念", type: "atk", cost: 2, icon: "🔮", desc: "造成12点伤害，敌方下回合伤害-15%", rarity: "u", cat: "atk", power: 2, fx: { dmg: 12, enemyWeak: 0.15 } },
  { id: "scald", name: "热水", type: "atk", cost: 2, icon: "♨️", desc: "造成12点伤害，35%灼烧2回合", rarity: "u", cat: "atk", power: 2, fx: { dmg: 12, status: "burn", statusChance: 0.35, statusTurns: 2 } },
  { id: "dragon_pulse", name: "龙之波动", type: "atk", cost: 2, icon: "🐉", desc: "造成16点伤害", rarity: "u", cat: "atk", power: 2, fx: { dmg: 16 } },
  { id: "aura_sphere", name: "波导弹", type: "atk", cost: 2, icon: "🌀", desc: "造成14点伤害，无视格挡", rarity: "u", cat: "atk", power: 2, fx: { dmg: 14, ignoreBlock: true } },
  { id: "dark_pulse", name: "恶之波动", type: "atk", cost: 2, icon: "🌑", desc: "造成13点伤害，25%混乱2回合", rarity: "u", cat: "atk", power: 2, fx: { dmg: 13, status: "confuse", statusChance: 0.25, statusTurns: 2 } },
  { id: "surf", name: "冲浪", type: "atk", cost: 2, icon: "🌊", desc: "造成15点伤害", rarity: "u", cat: "atk", power: 2, fx: { dmg: 15 } },
  { id: "earthquake", name: "地震", type: "atk", cost: 2, icon: "🌍", desc: "造成16点伤害", rarity: "r", cat: "atk", power: 3, fx: { dmg: 16 } },
  { id: "close_combat", name: "近身战", type: "atk", cost: 2, icon: "🥊", desc: "造成20点伤害，自身-4格挡", rarity: "r", cat: "atk", power: 3, fx: { dmg: 20, selfBlock: -4 } },
  { id: "shadow_ball", name: "暗影球", type: "atk", cost: 2, icon: "👻", desc: "造成15点伤害，获得3格挡", rarity: "r", cat: "atk", power: 3, fx: { dmg: 15, block: 3 } },
  { id: "fire_blast", name: "大字爆炎", type: "atk", cost: 3, icon: "🔥", desc: "造成22点伤害，30%灼烧2回合", rarity: "r", cat: "atk", power: 3, fx: { dmg: 22, status: "burn", statusChance: 0.3, statusTurns: 2 } },
  { id: "hydro_pump", name: "水炮", type: "atk", cost: 3, icon: "💧", desc: "造成22点伤害", rarity: "r", cat: "atk", power: 3, fx: { dmg: 22 } },
  { id: "thunder", name: "打雷", type: "atk", cost: 3, icon: "🌩️", desc: "造成21点伤害，30%麻痹2回合", rarity: "r", cat: "atk", power: 3, fx: { dmg: 21, status: "para", statusChance: 0.3, statusTurns: 2 } },
  { id: "blizzard", name: "暴风雪", type: "atk", cost: 3, icon: "❄️", desc: "造成20点伤害，30%冰冻1回合", rarity: "r", cat: "atk", power: 3, fx: { dmg: 20, status: "freeze", statusChance: 0.3, statusTurns: 1 } },
  { id: "solar_beam", name: "日光束", type: "atk", cost: 3, icon: "☀️", desc: "造成25点伤害", rarity: "r", cat: "atk", power: 3, fx: { dmg: 25 } },
  { id: "flare_blitz", name: "闪焰冲锋", type: "atk", cost: 2, icon: "🔥", desc: "造成18点伤害，自身-3格挡，20%灼烧", rarity: "r", cat: "atk", power: 3, fx: { dmg: 18, selfBlock: -3, status: "burn", statusChance: 0.2, statusTurns: 2 } },
  { id: "stone_edge", name: "尖石攻击", type: "atk", cost: 2, icon: "🪨", desc: "造成19点伤害", rarity: "r", cat: "atk", power: 3, fx: { dmg: 19 } },
  { id: "draco_meteor", name: "流星群", type: "atk", cost: 3, icon: "☄️", desc: "造成26点伤害，自身-5格挡", rarity: "r", cat: "atk", power: 3, fx: { dmg: 26, selfBlock: -5 } },
  { id: "focus_blast", name: "真气弹", type: "atk", cost: 3, icon: "💥", desc: "造成23点伤害，敌方下回合伤害-10%", rarity: "r", cat: "atk", power: 3, fx: { dmg: 23, enemyWeak: 0.1 } },
  { id: "hyper_beam", name: "破坏光线", type: "atk", cost: 3, icon: "💥", desc: "造成28点伤害", rarity: "l", cat: "atk", power: 4, fx: { dmg: 28 } },
  { id: "giga_impact", name: "终极冲击", type: "atk", cost: 3, icon: "☄️", desc: "造成30点伤害", rarity: "l", cat: "atk", power: 4, fx: { dmg: 30 } },
  { id: "sacred_fire", name: "神圣之火", type: "atk", cost: 3, icon: "🔥", desc: "造成26点伤害，50%灼烧3回合", rarity: "l", cat: "atk", power: 4, fx: { dmg: 26, status: "burn", statusChance: 0.5, statusTurns: 3 } },
  { id: "volt_tackle", name: "伏特攻击", type: "atk", cost: 3, icon: "⚡", desc: "造成30点伤害，自身-6格挡，30%麻痹", rarity: "l", cat: "atk", power: 4, fx: { dmg: 30, selfBlock: -6, status: "para", statusChance: 0.3, statusTurns: 2 } },
  { id: "eruption", name: "喷火", type: "atk", cost: 3, icon: "🌋", desc: "造成24-32点伤害（HP越低伤害越低）", rarity: "l", cat: "atk", power: 4, fx: { dmg: 28 } },

  // ═══ 防御系 def ═══
  { id: "harden", name: "变硬", type: "def", cost: 1, icon: "🪨", desc: "获得8点格挡", rarity: "c", cat: "def", power: 1, fx: { block: 8 } },
  { id: "defense_curl", name: "变圆", type: "def", cost: 1, icon: "🛡️", desc: "获得10点格挡", rarity: "c", cat: "def", power: 1, fx: { block: 10 } },
  { id: "endure", name: "挺住", type: "def", cost: 0, icon: "💪", desc: "获得5点格挡", rarity: "c", cat: "def", power: 1, fx: { block: 5 } },
  { id: "withdraw", name: "缩入壳中", type: "def", cost: 1, icon: "🐚", desc: "获得9点格挡", rarity: "c", cat: "def", power: 1, fx: { block: 9 } },
  { id: "protect", name: "守住", type: "def", cost: 2, icon: "🔰", desc: "获得18点格挡", rarity: "u", cat: "def", power: 2, fx: { block: 18 } },
  { id: "reflect", name: "反射壁", type: "def", cost: 2, icon: "🪞", desc: "获得12点格挡，本回合受伤-25%", rarity: "u", cat: "def", power: 2, fx: { block: 12, defMult: 0.75 } },
  { id: "light_screen", name: "光墙", type: "def", cost: 2, icon: "✨", desc: "获得10点格挡，本回合受伤-30%", rarity: "u", cat: "def", power: 2, fx: { block: 10, defMult: 0.7 } },
  { id: "amnesia", name: "瞬间失忆", type: "def", cost: 1, icon: "😶", desc: "获得6点格挡，本回合受伤-20%", rarity: "u", cat: "def", power: 2, fx: { block: 6, defMult: 0.8 } },
  { id: "iron_defense", name: "铁壁", type: "def", cost: 2, icon: "⛓️", desc: "获得22点格挡", rarity: "r", cat: "def", power: 3, fx: { block: 22 } },
  { id: "barrier", name: "屏障", type: "def", cost: 3, icon: "🧱", desc: "获得30点格挡", rarity: "r", cat: "def", power: 3, fx: { block: 30 } },
  { id: "cosmic_power", name: "宇宙力量", type: "def", cost: 2, icon: "🌌", desc: "获得14点格挡，抽1张牌", rarity: "r", cat: "def", power: 3, fx: { block: 14, draw: 1 } },
  { id: "spiky_shield", name: "尖刺防守", type: "def", cost: 2, icon: "🌵", desc: "获得16点格挡，反弹4点伤害", rarity: "r", cat: "def", power: 3, fx: { block: 16, dmg: 4 } },
  { id: "baneful_bunker", name: "碉堡", type: "def", cost: 2, icon: "🏰", desc: "获得15点格挡，25%中毒2回合", rarity: "r", cat: "def", power: 3, fx: { block: 15, status: "poison", statusChance: 0.25, statusTurns: 2 } },
  { id: "king_shield", name: "王者盾牌", type: "def", cost: 3, icon: "👑", desc: "获得35点格挡，下回合受伤减半", rarity: "l", cat: "def", power: 4, fx: { block: 35, defMult: 0.5 } },
  { id: "crafty_shield", name: "诡异之盾", type: "def", cost: 2, icon: "🪬", desc: "获得20点格挡，抽1张牌", rarity: "l", cat: "def", power: 4, fx: { block: 20, draw: 1 } },

  // ═══ 恢复系 heal ═══
  { id: "recover", name: "自我再生", type: "heal", cost: 1, icon: "💚", desc: "回复12点HP", rarity: "c", cat: "heal", power: 1, fx: { healFlat: 12 } },
  { id: "roost", name: "羽栖", type: "heal", cost: 1, icon: "🪶", desc: "回复 maxHP 的 20%", rarity: "c", cat: "heal", power: 1, fx: { healPct: 0.2 } },
  { id: "life_dew", name: "生命水滴", type: "heal", cost: 1, icon: "💧", desc: "回复10HP并获得3格挡", rarity: "c", cat: "heal", power: 1, fx: { healFlat: 10, block: 3 } },
  { id: "synthesis", name: "光合作用", type: "heal", cost: 1, icon: "🌿", desc: "回复 maxHP 的 25%", rarity: "u", cat: "heal", power: 2, fx: { healPct: 0.25 } },
  { id: "softboiled", name: "生蛋", type: "heal", cost: 2, icon: "🥚", desc: "回复 maxHP 的 35%", rarity: "u", cat: "heal", power: 2, fx: { healPct: 0.35 } },
  { id: "giga_drain", name: "终极吸取", type: "heal", cost: 2, icon: "🧛", desc: "造成8点伤害并回复等量HP", rarity: "u", cat: "heal", power: 2, fx: { dmg: 8, lifesteal: 1 } },
  { id: "draining_kiss", name: "吸取之吻", type: "heal", cost: 1, icon: "💋", desc: "造成5点伤害，回复伤害值75%的HP", rarity: "u", cat: "heal", power: 2, fx: { dmg: 5, lifesteal: 0.75 } },
  { id: "aqua_ring", name: "水流环", type: "heal", cost: 1, icon: "💍", desc: "回复8HP，敌方-5%伤害", rarity: "u", cat: "heal", power: 2, fx: { healFlat: 8, enemyWeak: 0.05 } },
  { id: "wish", name: "祈愿", type: "heal", cost: 1, icon: "🌟", desc: "回复15HP并获得4格挡", rarity: "r", cat: "heal", power: 3, fx: { healFlat: 15, block: 4 } },
  { id: "moonlight", name: "月光", type: "heal", cost: 2, icon: "🌙", desc: "回复 maxHP 的 40%", rarity: "r", cat: "heal", power: 3, fx: { healPct: 0.4 } },
  { id: "pain_split", name: "分担痛楚", type: "heal", cost: 2, icon: "🔄", desc: "回复18HP，敌方受到6点伤害", rarity: "r", cat: "heal", power: 3, fx: { healFlat: 18, dmg: 6 } },
  { id: "milk_drink", name: "喝牛奶", type: "heal", cost: 2, icon: "🥛", desc: "回复 maxHP 的 35%，获得5格挡", rarity: "r", cat: "heal", power: 3, fx: { healPct: 0.35, block: 5 } },
  { id: "healing_wish", name: "治愈之愿", type: "heal", cost: 3, icon: "💖", desc: "回复 maxHP 的 55%", rarity: "l", cat: "heal", power: 4, fx: { healPct: 0.55 } },
  { id: "lunar_blessing", name: "月之祝福", type: "heal", cost: 3, icon: "🌝", desc: "回复 maxHP 的 45%，获得10格挡", rarity: "l", cat: "heal", power: 4, fx: { healPct: 0.45, block: 10 } },

  // ═══ 控制系 control ═══
  { id: "agility", name: "高速移动", type: "control", cost: 1, icon: "🏃", desc: "获得2点能量", rarity: "c", cat: "control", power: 1, fx: { energy: 2 } },
  { id: "focus_energy", name: "聚气", type: "control", cost: 1, icon: "🎯", desc: "本回合伤害×1.4", rarity: "c", cat: "control", power: 1, fx: { mult: 1.4 } },
  { id: "work_up", name: "自我激励", type: "control", cost: 1, icon: "📈", desc: "伤害×1.25，获得1能量", rarity: "c", cat: "control", power: 1, fx: { mult: 1.25, energy: 1 } },
  { id: "swords_dance", name: "剑舞", type: "control", cost: 1, icon: "🗡️", desc: "本回合伤害×1.8", rarity: "u", cat: "control", power: 2, fx: { mult: 1.8 } },
  { id: "nasty_plot", name: "诡计", type: "control", cost: 2, icon: "😈", desc: "本回合伤害×2.2", rarity: "u", cat: "control", power: 2, fx: { mult: 2.2 } },
  { id: "calm_mind", name: "冥想", type: "control", cost: 1, icon: "🧘", desc: "获得8格挡，伤害×1.3", rarity: "u", cat: "control", power: 2, fx: { block: 8, mult: 1.3 } },
  { id: "bulk_up", name: "健美", type: "control", cost: 1, icon: "💪", desc: "获得10格挡，伤害×1.25", rarity: "u", cat: "control", power: 2, fx: { block: 10, mult: 1.25 } },
  { id: "growth", name: "生长", type: "control", cost: 0, icon: "🌱", desc: "本回合伤害×1.3（0费）", rarity: "u", cat: "control", power: 2, fx: { mult: 1.3 } },
  { id: "dragon_dance", name: "龙之舞", type: "control", cost: 2, icon: "🐉", desc: "伤害×1.6，获得1能量", rarity: "r", cat: "control", power: 3, fx: { mult: 1.6, energy: 1 } },
  { id: "tailwind", name: "顺风", type: "control", cost: 0, icon: "🌪️", desc: "获得1能量并抽1张", rarity: "r", cat: "control", power: 3, fx: { energy: 1, draw: 1 } },
  { id: "coil", name: "盘蜷", type: "control", cost: 1, icon: "🐍", desc: "获得10格挡，伤害×1.35", rarity: "r", cat: "control", power: 3, fx: { block: 10, mult: 1.35 } },
  { id: "shell_smash", name: "破壳", type: "control", cost: 2, icon: "🥚", desc: "伤害×2.2，但自身-8格挡", rarity: "r", cat: "control", power: 3, fx: { mult: 2.2, selfBlock: -8 } },
  { id: "quiver_dance", name: "蝶舞", type: "control", cost: 2, icon: "🦋", desc: "伤害×2，获得6格挡", rarity: "l", cat: "control", power: 4, fx: { mult: 2, block: 6 } },
  { id: "geomancy", name: "大地掌控", type: "control", cost: 3, icon: "✨", desc: "伤害×2.5，获得8格挡，获得1能量", rarity: "l", cat: "control", power: 4, fx: { mult: 2.5, block: 8, energy: 1 } },
  { id: "baton_pass", name: "接棒", type: "control", cost: 1, icon: "🏏", desc: "获得2能量并抽2张牌", rarity: "l", cat: "control", power: 4, fx: { energy: 2, draw: 2 } },

  // ═══ 异常系 status ═══
  { id: "thunder_wave", name: "电磁波", type: "status", cost: 1, icon: "⚡", desc: "麻痹：敌下2回合伤害-40%", rarity: "c", cat: "status", power: 1, fx: { status: "para", statusTurns: 2 } },
  { id: "will_o_wisp", name: "鬼火", type: "status", cost: 1, icon: "👻", desc: "灼烧：敌每回合结束受4伤，2回合", rarity: "c", cat: "status", power: 1, fx: { status: "burn", statusTurns: 2 } },
  { id: "stun_spore", name: "麻痹粉", type: "status", cost: 1, icon: "🌼", desc: "麻痹2回合并造成3点伤害", rarity: "c", cat: "status", power: 1, fx: { dmg: 3, status: "para", statusTurns: 2 } },
  { id: "poison_powder", name: "毒粉", type: "status", cost: 1, icon: "☠️", desc: "中毒：敌每回合结束受4伤，3回合", rarity: "c", cat: "status", power: 1, fx: { status: "poison", statusTurns: 3 } },
  { id: "toxic", name: "剧毒", type: "status", cost: 1, icon: "☠️", desc: "中毒：敌每回合结束受6伤，3回合", rarity: "u", cat: "status", power: 2, fx: { status: "poison", statusTurns: 3 } },
  { id: "sleep_powder", name: "催眠粉", type: "status", cost: 2, icon: "💤", desc: "催眠：敌跳过下1次攻击", rarity: "u", cat: "status", power: 2, fx: { status: "sleep", statusTurns: 1 } },
  { id: "confuse_ray", name: "奇异之光", type: "status", cost: 1, icon: "💫", desc: "混乱：敌下回合50%自伤", rarity: "u", cat: "status", power: 2, fx: { status: "confuse", statusTurns: 2 } },
  { id: "yawn", name: "哈欠", type: "status", cost: 1, icon: "🥱", desc: "催眠：敌方下回合结束后入睡1回合", rarity: "u", cat: "status", power: 2, fx: { status: "sleep", statusTurns: 1 } },
  { id: "charm", name: "撒娇", type: "status", cost: 1, icon: "😘", desc: "敌方下回合伤害-30%并造成4点伤害", rarity: "u", cat: "status", power: 2, fx: { dmg: 4, enemyWeak: 0.3 } },
  { id: "spore", name: "蘑菇孢子", type: "status", cost: 2, icon: "🍄", desc: "强力催眠：敌跳过下2次攻击", rarity: "r", cat: "status", power: 3, fx: { status: "sleep", statusTurns: 2 } },
  { id: "glare", name: "大蛇瞪眼", type: "status", cost: 1, icon: "👀", desc: "麻痹3回合", rarity: "r", cat: "status", power: 3, fx: { status: "para", statusTurns: 3 } },
  { id: "leech_seed", name: "寄生种子", type: "status", cost: 2, icon: "🌱", desc: "寄生：造成5伤，中毒3回合（每回合6伤）", rarity: "r", cat: "status", power: 3, fx: { dmg: 5, status: "poison", statusTurns: 3 } },
  { id: "destiny_bond", name: "同命", type: "status", cost: 2, icon: "🔗", desc: "敌方受到10点伤害，自身-5HP", rarity: "r", cat: "status", power: 3, fx: { dmg: 10, selfDmg: 5 } },
  { id: "scary_face", name: "鬼面", type: "status", cost: 1, icon: "👹", desc: "敌方下回合伤害-35%，获得4格挡", rarity: "r", cat: "status", power: 3, fx: { enemyWeak: 0.35, block: 4 } },
  { id: "dark_void", name: "暗黑洞", type: "status", cost: 3, icon: "🕳️", desc: "睡眠2回合+造成8伤害", rarity: "l", cat: "status", power: 4, fx: { dmg: 8, status: "sleep", statusTurns: 2 } },
  { id: "hypnosis", name: "催眠术", type: "status", cost: 1, icon: "🌀", desc: "催眠2回合", rarity: "l", cat: "status", power: 4, fx: { status: "sleep", statusTurns: 2 } },
  { id: "sheer_cold", name: "绝对零度", type: "status", cost: 3, icon: "❄️", desc: "造成20点伤害，100%冰冻2回合", rarity: "l", cat: "status", power: 4, fx: { dmg: 20, status: "freeze", statusTurns: 2 } },
];

export const STARTER_CARD_IDS = [
  "tackle",
  "harden",
  "recover",
  "agility",
  "thunder_wave",
];

export const CARD_CAT_NAMES: Record<string, string> = {
  atk: "攻击",
  def: "防御",
  heal: "恢复",
  control: "控制",
  status: "异常",
};

export function findCard(id: string): CardDef | undefined {
  return ALL_CARDS.find((c) => c.id === id);
}

/** 从 id/浅拷贝重建带完整字段的卡(等价旧 hydrateCard) */
export function hydrateCard(card: CardDef | { id?: string; name?: string } | string): Card | null {
  if (typeof card === "string") {
    const base = findCard(card);
    return base ? { ...base, _played: false } : null;
  }
  const id = card.id;
  const base = id ? findCard(id) : undefined;
  if (base) return { ...base, _played: false };
  return null;
}

export function hydrateCardList(list: unknown[]): Card[] {
  if (!Array.isArray(list)) return [];
  return list.map((c) => hydrateCard(c as CardDef)).filter(Boolean) as Card[];
}

export function cardFromIdList(ids: string[]): Card[] {
  return ids.map((id) => hydrateCard(id)).filter(Boolean) as Card[];
}

/** 对敌方造成伤害(含格挡结算),返回事件 */
function dealEnemyDamage(
  ctx: BattleCtx,
  rawAmount: number,
  ignoreBlock: boolean,
  events: CardFxEvent[],
) {
  let actual = Math.floor(rawAmount * ctx.playerDmgMult);
  let blocked = 0;
  if (!ignoreBlock && ctx.enemyBlock > 0) {
    blocked = Math.min(ctx.enemyBlock, actual);
    ctx.enemyBlock -= blocked;
    actual -= blocked;
  }
  ctx.enemyHp = Math.max(0, ctx.enemyHp - actual);
  events.push({ type: "dmg", amount: actual, blocked });
}

/**
 * 执行卡牌效果(迁移自 standalone battle.js applyCardFx,去掉 DOM 调用)。
 * 直接修改 ctx,返回事件列表供 UI 播放特效。
 */
export function applyCardFx(card: CardDef, ctx: BattleCtx): CardFxEvent[] {
  const fx: CardFx = card.fx || {};
  const events: CardFxEvent[] = [];
  let totalDmg = 0;

  if (fx.dmg) {
    const hits = fx.hits || 1;
    for (let h = 0; h < hits; h++) {
      const d = fx.dmg + ctx.atk;
      if (fx.pierce) {
        const direct = Math.floor(d * fx.pierce);
        const rest = d - direct;
        if (direct > 0) dealEnemyDamage(ctx, direct, true, events);
        if (rest > 0) dealEnemyDamage(ctx, rest, false, events);
        totalDmg += d;
      } else {
        dealEnemyDamage(ctx, d, !!fx.ignoreBlock, events);
        totalDmg += d;
      }
    }
  }

  if (fx.selfBlock) {
    ctx.block = Math.max(0, ctx.block + fx.selfBlock);
    events.push({ type: "block", amount: fx.selfBlock });
  }
  if (fx.block) {
    ctx.block += fx.block;
    events.push({ type: "block", amount: fx.block });
  }

  if (fx.selfDmg) {
    ctx.hp = Math.max(0, ctx.hp - fx.selfDmg);
    events.push({ type: "selfDmg", amount: fx.selfDmg });
  }

  if (fx.healFlat) {
    const before = ctx.hp;
    ctx.hp = Math.min(ctx.maxHp, ctx.hp + fx.healFlat);
    if (ctx.hp > before) events.push({ type: "heal", amount: ctx.hp - before });
  }
  if (fx.healPct) {
    const amt = Math.floor(ctx.maxHp * fx.healPct);
    const before = ctx.hp;
    ctx.hp = Math.min(ctx.maxHp, ctx.hp + amt);
    if (ctx.hp > before) events.push({ type: "heal", amount: ctx.hp - before });
  }
  if (fx.lifesteal && totalDmg > 0) {
    const heal = Math.floor(totalDmg * fx.lifesteal);
    ctx.hp = Math.min(ctx.maxHp, ctx.hp + heal);
    events.push({ type: "heal", amount: heal });
  }

  if (fx.energy) {
    ctx.energy += fx.energy;
    events.push({ type: "energy", amount: fx.energy });
  }
  if (fx.mult) {
    ctx.playerDmgMult *= fx.mult;
    events.push({ type: "mult", mult: fx.mult });
  }
  if (fx.defMult) ctx.playerDefMult *= fx.defMult;
  if (fx.enemyWeak) {
    ctx.enemyAtkMult *= 1 - fx.enemyWeak;
    events.push({ type: "weak", amount: fx.enemyWeak });
  }

  if (fx.status) {
    const chance = fx.statusChance == null ? 1 : fx.statusChance;
    if (Math.random() < chance) {
      ctx.enemyStatus = { type: fx.status, turns: fx.statusTurns || 1 };
      events.push({ type: "status", status: fx.status });
    }
  }

  if (fx.draw) {
    ctx.draw(fx.draw);
    events.push({ type: "draw", n: fx.draw });
  }

  return events;
}

export { STATUS_NAMES };
