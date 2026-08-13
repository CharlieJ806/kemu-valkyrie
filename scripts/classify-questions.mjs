/**
 * 科目一题库四大板块分类器(纯 node,无依赖)。
 * 运行: node scripts/classify-questions.mjs
 *
 * 打分制:按"考察点"关键词(而非泛主题)对 q+opts 全文匹配打分,
 * 并列时按 signal > civility > law > safety 取先,0 分兜底归 safety。
 * 输出 data/question_cats.json:{ "<qid>": { cat: "law"|"signal"|"safety"|"civility", manual?: true } }
 * 已存在的 manual:true 条目(人工修正)会被保留跳过。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUESTIONS_PATH = path.join(ROOT, "data", "questions.json");
const OUT_PATH = path.join(ROOT, "data", "question_cats.json");

const KEYWORDS = {
  // 交通信号(强特异性,权重 3)
  signal: {
    w: 3,
    words: [
      "信号灯", "红灯", "绿灯", "黄灯", "手势", "交警", "标线", "标志", "禁令",
      "警告", "指示", "导向", "箭头", "闪烁", "导向车道", "车道线", "交叉路口",
    ],
  },
  // 文明驾驶(强特异性,权重 3)
  civility: {
    w: 3,
    words: [
      "文明", "礼让", "让行", "行人", "鸣笛", "远光", "排队", "借道", "路怒",
      "谦让", "依次", "喇叭", "斑马线", "慢行",
    ],
  },
  // 法律法规(权重 2,词多易虚高)
  law: {
    w: 2,
    words: [
      "罚款", "记分", "吊销", "拘留", "违法", "犯罪", "责任", "驾驶证", "登记",
      "报废", "保险", "验车", "满分", "暂扣", "扣留", "年检", "有期徒刑", "拘役",
      "处罚", "逃逸", "刑事责任", "实习期", "审验",
    ],
  },
  // 安全驾驶(权重 1,长尾兜底)
  safety: {
    w: 1,
    words: [
      "安全", "车速", "制动", "超车", "会车", "停车", "倒车", "掉头", "转弯",
      "夜间", "雨天", "雾天", "雪天", "高速", "疲劳", "酒驾", "侧滑", "爆胎",
      "车距", "间距", "起步", "灯光", "机油", "冷却", "轮胎", "方向盘",
      "安全带", "气囊", "刹车", "减速", "跟车", "山区", "隧道", "桥梁",
    ],
  },
};

const ORDER = ["signal", "civility", "law", "safety"];

function score(q, opts) {
  const text = (q + " " + (opts || []).join(" ")).replace(/\s+/g, "");
  const scores = {};
  for (const [cat, def] of Object.entries(KEYWORDS)) {
    let s = 0;
    for (const word of def.words) {
      if (word.length >= 2 && text.includes(word)) s += def.w;
    }
    scores[cat] = s;
  }
  return scores;
}

function decide(scores) {
  const max = Math.max(...Object.values(scores));
  if (max === 0) return "safety";
  // 并列时按优先级取先
  for (const cat of ORDER) {
    if (scores[cat] === max) return cat;
  }
  return "safety";
}

function main() {
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  const prev = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, "utf8"))
    : {};
  const next = {};
  const counts = { law: 0, signal: 0, safety: 0, civility: 0 };
  let manualKept = 0;
  let changed = 0;

  for (const q of questions) {
    const p = prev[q.id];
    if (p && p.manual) {
      next[q.id] = p;
      counts[p.cat] = (counts[p.cat] || 0) + 1;
      manualKept++;
      continue;
    }
    const cat = decide(score(q.q, q.opts));
    next[q.id] = { cat };
    counts[cat]++;
    if (!p || p.cat !== cat) changed++;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(next, null, 2) + "\n");
  const total = questions.length;
  console.log(`共 ${total} 题 → ${path.relative(ROOT, OUT_PATH)}`);
  for (const cat of ORDER) {
    console.log(
      `  ${cat.padEnd(8)} ${String(counts[cat]).padStart(4)} 题  ${Math.round((counts[cat] / total) * 100)}%`,
    );
  }
  console.log(`人工修正保留: ${manualKept} 条,本轮变更: ${changed} 条`);

  // 每类随机抽 20 题供人工校对
  const byCat = { law: [], signal: [], safety: [], civility: [] };
  for (const q of questions) byCat[next[q.id].cat].push(q);
  for (const cat of ORDER) {
    console.log(`\n── ${cat} 抽样 ──`);
    const pool = [...byCat[cat]].sort(() => Math.random() - 0.5).slice(0, 20);
    for (const q of pool) console.log(`  [${q.id}] ${q.q.slice(0, 42)}`);
  }
}

main();
