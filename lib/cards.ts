import type {
  Card,
  CardDef,
  CardFx,
  EnemyStatus,
  StatusType,
} from "./types";
import type { Valkyrie } from "@/data";
import { ENEMY_WEAK_FLOOR, ENEMY_WEAK_TURNS } from "@/data/constants";

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
  enemyWeakTurns: number;
  enemyStatus: EnemyStatus | null;
  atk: number;
  draw: (n: number) => void;
  /** Boss 雾隐:闪避玩家攻击 */
  dodge?: boolean;
  /** Boss 机制额外伤害倍率(路障减伤等) */
  dmgMult?: number;
  /** 词缀·荆棘:反伤回调(实际造成伤害后触发) */
  reflect?: (amount: number) => void;
  /** 词缀·复苏:本次攻击致死后复活 50% */
  revive?: boolean;
};

export type CardFxEvent =
  | { type: "dmg"; amount: number; blocked: number }
  | { type: "dodge"; amount: 0 }
  | { type: "revive" }
  | { type: "block"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "selfDmg"; amount: number }
  | { type: "energy"; amount: number }
  | { type: "status"; status: StatusType }
  | { type: "mult"; mult: number }
  | { type: "weak"; amount: number }
  | { type: "draw"; n: number }
  | { type: "tax"; message: string }
  | { type: "link"; valkId: number; valkName: string; amount: number; bonus: "dmg" | "energy" | "block" | "confuse" };

const STATUS_NAMES: Record<StatusType, string> = {
  burn: "违章曝光",
  para: "限速减速",
  poison: "扣分侵蚀",
  sleep: "禁行拘留",
  freeze: "冻结车流",
  confuse: "远光眩目",
};

/* ============ 卡牌定义(科目一四大板块 × 驾驶主题) ============ */

export const ALL_CARDS: CardDef[] = [
  // ═══ law 法律法规(制裁输出) ═══
  { id: "jf_cf", name: "记分处罚", type: "atk", cost: 1, icon: "⚖️", desc: "造成7点伤害", rarity: "c", cat: "atk", attr: "law", power: 1, fx: { dmg: 7 } },
  { id: "fk_ts", name: "罚款通知", type: "atk", cost: 1, icon: "📜", desc: "造成5点伤害，敌方伤害-15%", rarity: "c", cat: "atk", attr: "law", power: 1, fx: { dmg: 5, enemyWeak: 0.15 } },
  { id: "fz_sb", name: "法规护盾", type: "def", cost: 1, icon: "🛡️", desc: "获得8点格挡，敌方伤害-10%", rarity: "c", cat: "def", attr: "law", power: 1, fx: { block: 8, enemyWeak: 0.1 } },
  { id: "kf_jb", name: "扣分加倍", type: "control", cost: 1, icon: "✖️", desc: "本回合伤害×1.4", rarity: "c", cat: "control", attr: "law", power: 1, fx: { mult: 1.4 } },
  { id: "dz_zy", name: "电子眼抓拍", type: "atk", cost: 2, icon: "📸", desc: "造成12点伤害，一半无视格挡", rarity: "u", cat: "atk", attr: "law", power: 2, fx: { dmg: 12, pierce: 0.5 } },
  { id: "xm_jy", name: "满分教育", type: "atk", cost: 2, icon: "🎓", desc: "造成13点伤害，敌方伤害-10%", rarity: "u", cat: "atk", attr: "law", power: 2, fx: { dmg: 13, enemyWeak: 0.1 } },
  { id: "xf_jf", name: "学法减分", type: "control", cost: 1, icon: "➖", desc: "获得2点指令", rarity: "u", cat: "control", attr: "law", power: 2, fx: { energy: 2 } },
  { id: "hh_zx", name: "扣留审验", type: "status", cost: 1, icon: "🔒", desc: "暂扣证件：限速减速2回合", rarity: "u", cat: "status", attr: "law", power: 2, fx: { status: "para", statusTurns: 2 } },
  { id: "dx_jz", name: "吊销驾照", type: "atk", cost: 3, icon: "🚫", desc: "造成22点伤害", rarity: "r", cat: "atk", attr: "law", power: 3, fx: { dmg: 22 } },
  { id: "cf_tl", name: "重罚条例", type: "atk", cost: 2, icon: "🔨", desc: "造成8点伤害×2", rarity: "r", cat: "atk", attr: "law", power: 3, fx: { dmg: 8, hits: 2 } },
  { id: "sf_fk", name: "双倍罚款", type: "control", cost: 2, icon: "💰", desc: "本回合伤害×2.2", rarity: "r", cat: "control", attr: "law", power: 3, fx: { mult: 2.2 } },
  { id: "xs_qz", name: "刑事追责", type: "status", cost: 2, icon: "⚖️", desc: "造成6点伤害，扣分侵蚀3回合", rarity: "r", cat: "status", attr: "law", power: 3, fx: { dmg: 6, status: "poison", statusTurns: 3 } },
  { id: "jl_15", name: "拘留十五日", type: "atk", cost: 2, icon: "⛓️", desc: "造成10点伤害，禁行拘留1回合", rarity: "r", cat: "atk", attr: "law", power: 3, fx: { dmg: 10, status: "sleep", statusTurns: 1 } },
  { id: "zs_jj", name: "终身禁驾", type: "atk", cost: 3, icon: "⛔", desc: "造成28点伤害，无视格挡", rarity: "l", cat: "atk", attr: "law", power: 4, fx: { dmg: 28, ignoreBlock: true } },
  { id: "fz_wq", name: "法制权威", type: "control", cost: 2, icon: "🏛️", desc: "本回合伤害×2.5", rarity: "l", cat: "control", attr: "law", power: 4, fx: { mult: 2.5 } },
  { id: "zf_xs", name: "追罚销号", type: "status", cost: 2, icon: "📛", desc: "造成8点伤害，禁行拘留2回合", rarity: "l", cat: "status", attr: "law", power: 4, fx: { dmg: 8, status: "sleep", statusTurns: 2 } },

  // ═══ signal 交通信号(控制压制) ═══
  { id: "ldx", name: "绿灯行", type: "control", cost: 1, icon: "🟢", desc: "获得2点指令", rarity: "c", cat: "control", attr: "signal", power: 1, fx: { energy: 2 } },
  { id: "hdt", name: "红灯停", type: "status", cost: 1, icon: "🔴", desc: "红灯禁行：敌方跳过1次攻击", rarity: "c", cat: "status", attr: "signal", power: 1, fx: { status: "sleep", statusTurns: 1 } },
  { id: "xsbz", name: "限速标志", type: "status", cost: 1, icon: "🐌", desc: "限速减速2回合", rarity: "c", cat: "status", attr: "signal", power: 1, fx: { status: "para", statusTurns: 2 } },
  { id: "ljbz", name: "禁令标志", type: "def", cost: 1, icon: "🚫", desc: "获得8点格挡，敌方伤害-15%", rarity: "c", cat: "def", attr: "signal", power: 1, fx: { block: 8, enemyWeak: 0.15 } },
  { id: "lbts", name: "绿波提速", type: "atk", cost: 1, icon: "💨", desc: "造成6点伤害，获得1点指令", rarity: "c", cat: "atk", attr: "signal", power: 1, fx: { dmg: 6, energy: 1 } },
  { id: "aqbz", name: "警告标志", type: "def", cost: 1, icon: "⚠️", desc: "获得6点格挡，本回合受伤-15%", rarity: "c", cat: "def", attr: "signal", power: 1, fx: { block: 6, defMult: 0.85 } },
  { id: "hdjs", name: "黄灯警示", type: "control", cost: 0, icon: "🟡", desc: "本回合伤害×1.3（0费）", rarity: "u", cat: "control", attr: "signal", power: 2, fx: { mult: 1.3 } },
  { id: "dxcd", name: "导向车道", type: "atk", cost: 2, icon: "🛣️", desc: "造成13点伤害，三成无视格挡", rarity: "u", cat: "atk", attr: "signal", power: 2, fx: { dmg: 13, pierce: 0.3 } },
  { id: "fdjs", name: "分道行驶", type: "atk", cost: 1, icon: "↔️", desc: "造成4点伤害×2", rarity: "u", cat: "atk", attr: "signal", power: 2, fx: { dmg: 4, hits: 2 } },
  { id: "zsbz", name: "指示标志", type: "def", cost: 2, icon: "📌", desc: "获得14点格挡，抽1张牌", rarity: "u", cat: "def", attr: "signal", power: 2, fx: { block: 14, draw: 1 } },
  { id: "jxqy", name: "禁行区域", type: "status", cost: 2, icon: "⛔", desc: "冻结车流1回合", rarity: "u", cat: "status", attr: "signal", power: 2, fx: { status: "freeze", statusTurns: 1 } },
  { id: "jjss", name: "交警手势", type: "control", cost: 2, icon: "✋", desc: "本回合伤害×2.2", rarity: "r", cat: "control", attr: "signal", power: 3, fx: { mult: 2.2 } },
  { id: "cqzf", name: "闯灯执法", type: "atk", cost: 2, icon: "🚦", desc: "造成14点伤害，敌方伤害-15%", rarity: "r", cat: "atk", attr: "signal", power: 3, fx: { dmg: 14, enemyWeak: 0.15 } },
  { id: "xhyx", name: "信号优先", type: "control", cost: 1, icon: "🔁", desc: "获得1点指令并抽1张牌", rarity: "r", cat: "control", attr: "signal", power: 3, fx: { energy: 1, draw: 1 } },
  { id: "lcxx", name: "绿波信号", type: "control", cost: 2, icon: "🌊", desc: "伤害×1.8，获得1点指令，抽1张牌", rarity: "l", cat: "control", attr: "signal", power: 4, fx: { mult: 1.8, energy: 1, draw: 1 } },
  { id: "qnxl", name: "全路限行", type: "status", cost: 2, icon: "🚧", desc: "造成8点伤害，冻结车流1回合", rarity: "l", cat: "status", attr: "signal", power: 4, fx: { dmg: 8, status: "freeze", statusTurns: 1 } },

  // ═══ safety 安全驾驶(护盾恢复) ═══
  { id: "aqd", name: "安全带", type: "def", cost: 1, icon: "🪢", desc: "获得8点格挡", rarity: "c", cat: "def", attr: "safety", power: 1, fx: { block: 8 } },
  { id: "bcjj", name: "保持车距", type: "def", cost: 1, icon: "📏", desc: "获得10点格挡", rarity: "c", cat: "def", attr: "safety", power: 1, fx: { block: 10 } },
  { id: "fyjs", name: "防御性驾驶", type: "heal", cost: 1, icon: "🧭", desc: "回复12点生命", rarity: "c", cat: "heal", attr: "safety", power: 1, fx: { healFlat: 12 } },
  { id: "wdjh", name: "稳当驾驶", type: "control", cost: 1, icon: "🚙", desc: "伤害×1.25，获得4点格挡", rarity: "c", cat: "control", attr: "safety", power: 1, fx: { mult: 1.25, block: 4 } },
  { id: "jjzd", name: "紧急制动", type: "def", cost: 2, icon: "🛑", desc: "获得18点格挡", rarity: "u", cat: "def", attr: "safety", power: 2, fx: { block: 18 } },
  { id: "abs", name: "防抱死系统", type: "def", cost: 2, icon: "⚙️", desc: "获得12点格挡，本回合受伤-25%", rarity: "u", cat: "def", attr: "safety", power: 2, fx: { block: 12, defMult: 0.75 } },
  { id: "fwqxx", name: "服务区休息", type: "heal", cost: 2, icon: "☕", desc: "回复 maxHP 的 35%", rarity: "u", cat: "heal", attr: "safety", power: 2, fx: { healPct: 0.35 } },
  { id: "jclt", name: "检查轮胎", type: "heal", cost: 1, icon: "🛞", desc: "回复10点生命，获得3点格挡", rarity: "u", cat: "heal", attr: "safety", power: 2, fx: { healFlat: 10, block: 3 } },
  { id: "aqcs", name: "安全超车", type: "atk", cost: 2, icon: "🚗", desc: "造成12点伤害，获得6点格挡", rarity: "u", cat: "atk", attr: "safety", power: 2, fx: { dmg: 12, block: 6 } },
  { id: "aqqn", name: "安全气囊", type: "def", cost: 3, icon: "🎈", desc: "获得30点格挡", rarity: "r", cat: "def", attr: "safety", power: 3, fx: { block: 30 } },
  { id: "etzy", name: "儿童座椅", type: "def", cost: 2, icon: "🧒", desc: "获得14点格挡，抽1张牌", rarity: "r", cat: "def", attr: "safety", power: 3, fx: { block: 14, draw: 1 } },
  { id: "wdkq", name: "雾灯开启", type: "def", cost: 1, icon: "💡", desc: "获得6点格挡，伤害×1.3", rarity: "r", cat: "def", attr: "safety", power: 3, fx: { block: 6, mult: 1.3 } },
  { id: "cfsm", name: "充分睡眠", type: "heal", cost: 2, icon: "😴", desc: "回复 maxHP 的 40%，获得4点格挡", rarity: "r", cat: "heal", attr: "safety", power: 3, fx: { healPct: 0.4, block: 4 } },
  { id: "fsfz", name: "防身反击", type: "atk", cost: 3, icon: "🛡️", desc: "造成16点伤害，获得12点格挡", rarity: "r", cat: "atk", attr: "safety", power: 3, fx: { dmg: 16, block: 12 } },
  { id: "aqmh", name: "安全磨合", type: "heal", cost: 3, icon: "🌟", desc: "回复 maxHP 的 50%，获得10点格挡", rarity: "l", cat: "heal", attr: "safety", power: 4, fx: { healPct: 0.5, block: 10 } },
  { id: "rchy", name: "人车合一", type: "control", cost: 2, icon: "🔧", desc: "伤害×2，获得8点格挡", rarity: "l", cat: "control", attr: "safety", power: 4, fx: { mult: 2, block: 8 } },

  // ═══ civility 文明驾驶(异常减益) ═══
  { id: "lrxr", name: "礼让行人", type: "status", cost: 1, icon: "🚸", desc: "造成4点伤害，敌方伤害-30%", rarity: "c", cat: "status", attr: "civility", power: 1, fx: { dmg: 4, enemyWeak: 0.3 } },
  { id: "bml", name: "不鸣笛", type: "status", cost: 1, icon: "🔕", desc: "静音警告：限速减速2回合", rarity: "c", cat: "status", attr: "civility", power: 1, fx: { status: "para", statusTurns: 2 } },
  { id: "pddh", name: "排队等候", type: "def", cost: 1, icon: "🚶", desc: "获得6点格挡，本回合受伤-20%", rarity: "c", cat: "def", attr: "civility", power: 1, fx: { block: 6, defMult: 0.8 } },
  { id: "qrxz", name: "谦让先行", type: "control", cost: 1, icon: "🙏", desc: "获得2点指令", rarity: "c", cat: "control", attr: "civility", power: 1, fx: { energy: 2 } },
  { id: "mdtx", name: "鸣笛提醒", type: "atk", cost: 1, icon: "📣", desc: "造成5点伤害，20%远光眩目1回合", rarity: "c", cat: "atk", attr: "civility", power: 1, fx: { dmg: 5, status: "confuse", statusChance: 0.2, statusTurns: 1 } },
  { id: "gbyg", name: "关闭远光", type: "status", cost: 1, icon: "🌙", desc: "远光眩目2回合", rarity: "u", cat: "status", attr: "civility", power: 2, fx: { status: "confuse", statusTurns: 2 } },
  { id: "jtdx", name: "交替通行", type: "control", cost: 1, icon: "🔀", desc: "获得1点指令并抽1张牌", rarity: "u", cat: "control", attr: "civility", power: 2, fx: { energy: 1, draw: 1 } },
  { id: "jjln", name: "拒绝路怒", type: "heal", cost: 1, icon: "🧘", desc: "回复8点生命，敌方伤害-5%", rarity: "u", cat: "heal", attr: "civility", power: 2, fx: { healFlat: 8, enemyWeak: 0.05 } },
  { id: "jdcc", name: "借道超车", type: "atk", cost: 2, icon: "🚘", desc: "造成14点伤害，自身-2格挡", rarity: "u", cat: "atk", attr: "civility", power: 2, fx: { dmg: 14, selfBlock: -2 } },
  { id: "tklr", name: "停靠礼让", type: "status", cost: 1, icon: "🅿️", desc: "造成3点伤害，限速减速2回合", rarity: "u", cat: "status", attr: "civility", power: 2, fx: { dmg: 3, status: "para", statusTurns: 2 } },
  { id: "jsrx", name: "减速让行", type: "status", cost: 2, icon: "🐢", desc: "禁行拘留1回合", rarity: "r", cat: "status", attr: "civility", power: 3, fx: { status: "sleep", statusTurns: 1 } },
  { id: "hgyg", name: "回敬远光", type: "atk", cost: 2, icon: "🔆", desc: "造成12点伤害，50%远光眩目1回合", rarity: "r", cat: "atk", attr: "civility", power: 3, fx: { dmg: 12, status: "confuse", statusChance: 0.5, statusTurns: 1 } },
  { id: "aysx", name: "安心随行", type: "heal", cost: 2, icon: "💗", desc: "回复14点生命，获得6点格挡", rarity: "r", cat: "heal", attr: "civility", power: 3, fx: { healFlat: 14, block: 6 } },
  { id: "wmcs", name: "文明超车", type: "atk", cost: 2, icon: "✨", desc: "造成16点伤害，远光眩目1回合", rarity: "l", cat: "atk", attr: "civility", power: 4, fx: { dmg: 16, status: "confuse", statusTurns: 1 } },
  { id: "wmxy", name: "文明协奏", type: "control", cost: 2, icon: "🎵", desc: "伤害×1.8，抽1张牌", rarity: "l", cat: "control", attr: "civility", power: 4, fx: { mult: 1.8, draw: 1 } },
  { id: "wmzg", name: "文明之光", type: "status", cost: 3, icon: "🌟", desc: "造成16点伤害，冻结车流2回合", rarity: "l", cat: "status", attr: "civility", power: 4, fx: { dmg: 16, status: "freeze", statusTurns: 2 } },
];

export const STARTER_CARD_IDS = [
  "jf_cf",
  "hdt",
  "aqd",
  "lrxr",
  "xf_jf",
];

export const CARD_CAT_NAMES: Record<string, string> = {
  atk: "攻击",
  def: "防御",
  heal: "恢复",
  control: "控制",
  status: "异常",
};

export function findCard(id: string): CardDef | undefined {
  if (id.startsWith(ULT_PREFIX)) return undefined;
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

/* ============ 领队必杀卡 ============ */

export const ULT_PREFIX = "ult_";

/** 领队大招槽上限(每出一张牌+1) */
export const ULT_GAUGE_MAX = 9;

/** 由领队(点火觉醒学员)的必杀技生成 0 费卡;不进 ALL_CARDS 与抽卡池 */
export function buildUltCard(valk: Valkyrie): Card {
  return {
    id: ULT_PREFIX + valk.id,
    name: valk.ult.name || "点火必杀",
    type: "atk",
    cost: 0,
    icon: "✨",
    desc: valk.ult.desc || "",
    rarity: "l",
    cat: "ult",
    attr: valk.attr,
    power: 5,
    fx: valk.ult.fx as CardFx,
  };
}

/** 对敌方造成伤害(含格挡结算),返回事件 */
function dealEnemyDamage(
  ctx: BattleCtx,
  rawAmount: number,
  ignoreBlock: boolean,
  events: CardFxEvent[],
) {
  // Boss 雾隐:闪避本次攻击
  if (ctx.dodge) {
    events.push({ type: "dodge", amount: 0 });
    return;
  }
  let actual = Math.floor(rawAmount * ctx.playerDmgMult * (ctx.dmgMult ?? 1));
  let blocked = 0;
  if (!ignoreBlock && ctx.enemyBlock > 0) {
    blocked = Math.min(ctx.enemyBlock, actual);
    ctx.enemyBlock -= blocked;
    actual -= blocked;
  }
  ctx.enemyHp = Math.max(0, ctx.enemyHp - actual);
  events.push({ type: "dmg", amount: actual, blocked });
  // 词缀·复苏:致死时复活 50%
  if (ctx.enemyHp <= 0 && ctx.revive) {
    ctx.enemyHp = Math.max(1, Math.floor(ctx.enemyMaxHp * 0.5));
    events.push({ type: "revive" });
  }
  // 词缀·荆棘:反伤(实际造成伤害后)
  if (actual > 0) ctx.reflect?.(actual);
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
    // 减益:乘算叠加但总削减不低于 40%,持续 2 回合(重复施加刷新)
    ctx.enemyAtkMult = Math.max(
      ENEMY_WEAK_FLOOR,
      ctx.enemyAtkMult * (1 - fx.enemyWeak),
    );
    ctx.enemyWeakTurns = ENEMY_WEAK_TURNS;
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
