/**
 * 战斗流程 + 布局检查(手机/桌面视口)。
 * 运行: node scripts/battle-flow-check.mjs
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

async function run(width, height, label) {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 150)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  // 清存档 → 首次游玩:新的冒险先进初始选择,选第一只后开局
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("新的冒险"))
      ?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    document.querySelectorAll(".starter-card")[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  // 第一列节点 row 随机(0-2),按布局公式动态算三个 y
  await page.evaluate(async () => {
    const canvas = document.querySelector("#map-canvas");
    const r = canvas.getBoundingClientRect();
    const H = canvas.height;
    const topPad = 72 + 36 * 0.25;
    const botPad = 72 + 18 * 0.25;
    const usableH = Math.max(1, H - topPad - botPad);
    const ys = [0, 1, 2].map((i) => topPad + (i / 2) * usableH);
    for (const y of ys) {
      canvas.dispatchEvent(
        new MouseEvent("click", { clientX: r.left + 50, clientY: r.top + y, bubbles: true }),
      );
      await new Promise((res) => setTimeout(res, 500));
      if (document.querySelector(".screen.active")?.id === "scr-battle") break;
    }
  });
  await new Promise((r) => setTimeout(r, 400));

  const battle1 = await page.evaluate(() => {
    const b = document.querySelector(".screen.active");
    const out = {};
    if (b?.id !== "scr-battle") {
      out.fail = b?.id;
      return out;
    }
    const vw = innerWidth;
    const vh = innerHeight;
    const overflow = [];
    document.querySelectorAll("#scr-battle *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.position === "absolute") return;
      const r2 = el.getBoundingClientRect();
      if (r2.width < 2 || r2.height < 2) return;
      if (r2.right > vw + 2) overflow.push(`${el.className?.toString?.().slice(0, 25)} R${Math.round(r2.right)}`);
      if (r2.bottom > vh + 2) overflow.push(`${el.className?.toString?.().slice(0, 25)} B${Math.round(r2.bottom)}`);
    });
    out.overflow = overflow.slice(0, 5);
    const ha = document.querySelector(".hand-area");
    out.handAreaH = ha ? Math.round(ha.getBoundingClientRect().height) : null;
    out.options = document.querySelectorAll(".battle-opt-btn").length;
    // 答第一题
    document.querySelectorAll(".battle-opt-btn")[0]?.click();
    return out;
  });
  await new Promise((r) => setTimeout(r, 1200));
  const after = await page.evaluate(() => {
    const scr = document.querySelector(".screen.active")?.id;
    const q2 = document.querySelector(".battle-q-text")?.textContent?.slice(0, 36);
    return { scr, q2 };
  });

  console.log(`\n[${label}] ${JSON.stringify({ ...battle1, after }, null, 1)}`);
  console.log(`  页面错误: ${errors.length ? errors.join(" | ") : "无"}`);
  await browser.close();
}

await run(390, 844, "手机 390x844");
await run(1280, 800, "桌面 1280x800");
