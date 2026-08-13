/**
 * 无头浏览器布局检查:遍历所有屏幕,检测真实溢出(非滚动容器内超出视口)/ 0 尺寸 / 报错。
 * 运行: node scripts/layout-check.mjs
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--window-size=390,844"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});
page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message.slice(0, 200)));

async function inspect(name) {
  const data = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const active = document.querySelector(".screen.active");
    const screenName = active ? active.id : "(无)";
    const overflow = [];
    const zeroH = [];
    let total = 0;
    document.querySelectorAll(".screen.active *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (el.tagName === "BR") return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) return;
      total++;
      if (r.height < 2 && r.width > 50) zeroH.push(`${el.tagName}.${el.className?.toString?.().slice(0, 30)}`);
      if (["fixed", "absolute"].includes(cs.position)) return;
      // 找滚动祖先(决定是否在滚动容器内)
      let anc = el.parentElement;
      let inScrollV = false, inScrollH = false;
      while (anc && anc !== document.body) {
        const acs = getComputedStyle(anc);
        if ((acs.overflowY === "auto" || acs.overflowY === "scroll") && anc.scrollHeight > anc.clientHeight + 2) inScrollV = true;
        if ((acs.overflowX === "auto" || acs.overflowX === "scroll") && anc.scrollWidth > anc.clientWidth + 2) inScrollH = true;
        anc = anc.parentElement;
      }
      const cls = `${el.tagName}.${el.className?.toString?.().slice(0, 28)}`;
      if (r.right > vw + 2 && !inScrollH) overflow.push(`${cls} 右界${Math.round(r.right)}>${vw}`);
      if (r.bottom > vh + 2 && !inScrollV) overflow.push(`${cls} 下界${Math.round(r.bottom)}>${vh}`);
    });
    // 宽度撑满检查:容器直接子元素明显收缩(<85% 容器宽)
    const inner = document.querySelector(".screen.active .title-inner");
    const shrink = [];
    if (inner) {
      const iw = inner.getBoundingClientRect().width;
      [...inner.children].forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.position === "absolute" || r.width < 1) return;
        const pct = Math.round((r.width / iw) * 100);
        if (pct < 85) {
          shrink.push(`${el.className?.toString?.().slice(0, 28)} ${pct}%`);
        }
      });
    }
    return {
      screen: screenName,
      total,
      overflow: overflow.slice(0, 6),
      zeroH: zeroH.slice(0, 6),
      shrink: shrink.slice(0, 4),
    };
  });
  console.log(`\n[${name}] 屏幕=${data.screen} 元素=${data.total}`);
  if (!data.overflow.length && !data.zeroH.length && !data.shrink.length)
    console.log("  ✅ 无溢出/零高/宽度收缩问题");
  data.overflow.forEach((o) => console.log("  ⚠️ 溢出:", o));
  data.zeroH.forEach((z) => console.log("  ⚠️ 零高:", z));
  data.shrink.forEach((s) => console.log("  ⚠️ 宽度收缩:", s));
}

async function clickText(anyOf) {
  const ok = await page.evaluate((texts) => {
    const els = [...document.querySelectorAll("button, .btn, .chip")];
    const el = els.find((e) => texts.some((t) => e.textContent?.includes(t)));
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, anyOf);
  await new Promise((r) => setTimeout(r, 700));
  return ok;
}

async function waitScreen(name) {
  for (let i = 0; i < 20; i++) {
    const cur = await page.evaluate(() => document.querySelector(".screen.active")?.id);
    if (cur === name) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

try {
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await inspect("标题页");

  for (const [label, btns] of [
    ["图鉴", ["图鉴"]],
    ["题库", ["题库复习"]],
    ["养成", ["养成"]],
    ["抽卡", ["技能抽卡"]],
    ["组牌", ["构建牌组"]],
    ["设置", ["设置"]],
    ["学习中心", ["学习中心"]],
  ]) {
    await clickText(btns);
    await inspect(label);
    await clickText(["← 返回", "返回"]);
    await waitScreen("scr-title");
  }

  // 学习中心子屏
  await clickText(["学习中心"]);
  await waitScreen("scr-study");
  await inspect("学习中心");
  await clickText(["科目一模拟"]);
  await inspect("考试-开考确认");
  await clickText(["返回"]);
  await waitScreen("scr-study");
  await clickText(["错题巩固"]);
  await inspect("错题本(空)");
  await clickText(["← 返回"]);
  await waitScreen("scr-study");
  await clickText(["← 返回"]);
  await waitScreen("scr-title");

  // 初始选择
  await clickText(["新的冒险"]);
  await waitScreen("scr-starter");
  await inspect("初始选择");

  // 地图:选初始宝可梦
  await page.evaluate(() => {
    document.querySelectorAll("#scr-starter .btn")[0]?.click();
  });
  await waitScreen("scr-map");
  await inspect("地图");

  // 战斗:点击第一列可达节点(canvas 左侧,尝试多个 y)
  const inBattle = await page.evaluate(async () => {
    const canvas = document.querySelector("#map-canvas");
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    for (const fy of [0.25, 0.45, 0.65, 0.85]) {
      const x = rect.left + 56;
      const y = rect.top + rect.height * fy;
      canvas.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const scr = document.querySelector(".screen.active")?.id;
      if (scr === "scr-battle") return true;
    }
    return false;
  });
  if (inBattle) await inspect("战斗(答题阶段)");
  else console.log("\n[战斗] ⚠️ 点击地图未进入战斗");

  console.log("\n=== 控制台错误 ===");
  if (!consoleErrors.length) console.log("  ✅ 无控制台错误");
  else consoleErrors.slice(0, 10).forEach((e) => console.log("  ❌", e));
} catch (e) {
  console.log("脚本异常:", e.message);
} finally {
  await browser.close();
}
