import { ALL_CARDS } from "./cards";
import { rand } from "./formulas";
import type { CardDef } from "./types";

/** 商店随机卡库存(迁移自 standalone openShop 的卡片区) */
export type ShopCardStock = {
  card: CardDef;
  price: number;
};

export function rollShopCards(count = 4): ShopCardStock[] {
  const pool = ALL_CARDS.filter((c) => c.rarity !== "l");
  const out: ShopCardStock[] = [];
  for (let i = 0; i < count; i++) {
    const card = pool[Math.floor(Math.random() * pool.length)]!;
    const price =
      card.rarity === "r" ? rand(90, 130) : card.rarity === "u" ? rand(55, 85) : rand(30, 55);
    out.push({ card, price });
  }
  return out;
}
