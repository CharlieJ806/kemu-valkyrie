# 驾考女武神 · 交规里世界净化战

《东京女武神》式卡组构筑肉鸽 × 科目一答题。驾考之城被「违章之暗」侵蚀——作为驾校学员，与女武神并肩作战，用科目一知识净化里世界！

## ✨ 功能特性

- **答题战斗**:答对攒指令(能量) → 出牌阶段打出驾驶技能卡 → 泄能攻击 → 敌方按意图反击
- **四大板块卡牌**:64 张驾驶主题技能卡，分属科目一四大板块——
  - ⚖️ **法律法规**(制裁输出) · 🚦 **交通信号**(控制压制) · 🛡️ **安全驾驶**(护盾恢复) · 🌸 **文明驾驶**(异常减益)
- **板块联动**:打出某板块卡牌时，队伍中该板块学员会联动出击（制裁/调度/守护/眩目）
- **点火觉醒**:在「神秘车库」拔出车钥匙为学员点火——获得第二板块、成为领队、解锁 0 费必杀技（每出一张牌积攒必杀槽，攒满自动加入手牌）
- **三人小队**:名册中自由配置出战学员（最多 3 名），独立血量、战斗切换、阵亡自动换人
- **收集养成**:16 名学员（四板块 × 四稀有度），用火花钥匙净化 20 只违章魔物结识新伙伴；训练营全队特训
- **随机街区**:每层随机生成地图（战斗/强敌/补给点/咖啡厅/异变/置物柜/违章魔王），击败魔王进入下一街区，无限闯关
- **题库板块分类**:1034 道真题按四大板块自动分类（可人工修正），战斗中 50% 概率按牌组主打板块抽题，题目带板块徽章
- **科目一模拟考试**:100 题 / 45 分钟 / 90 分合格 · 错题本 · 学习中心 · 题库导入

## 🎮 玩法

1. 「新的冒险」→ 选择初始学员（法规/信号/安全三选一）
2. 地图选路 → 遭遇战斗：答题攒指令 → 打牌（联动出击+攒必杀槽）→ 结束回合
3. 胜利净化魔物（火花钥匙）、选奖励卡；异变遇「神秘车库」点火觉醒
4. 击败违章魔王进入下一街区，冲击最高分

## 🛠 技术栈

- **Next.js 16**(App Router, Turbopack) · **React 19** · **TypeScript**
- **zustand 5**(单 store + localStorage 持久化,键名 `kemuValkyrie_*`)
- **three.js**(3D 战斗舞台) · 纯 CSS 日漫画风主题 · Web Audio 程序化音效
- 纯客户端运行,无后端依赖

## 🖼 立绘替换规范

立绘存放在 `public/art/valkyrie/{id}.webp`（id 见 `data/valkyries.json`：学员 1-16、魔物 101-120）。未配置时自动使用程序化占位立绘。

- 规格:竖版 **512×640 或 320×400**，透明背景 WebP/PNG，单张 < 200KB，主体居中偏下
- 替换流程:把图片放到 `public/art/valkyrie/{id}.webp` → 刷新即生效（若为新增 id，需在 `data/portraits.json` 中加入 `"{id}": true`）
- 批量导入 AI 素材:把原图放进 `resource/characters/{系列}/` 或 `resource/enemies/{系列}/`，在 `scripts/portrait-map.json` 中配置「文件名 → 角色 id」，运行 `node scripts/process-portraits.mjs`（自动压缩为 480×640 webp 并生成 portraits.json）

## 📜 脚本

| 脚本 | 作用 |
|---|---|
| `node scripts/classify-questions.mjs` | 题库四大板块分类（支持 `manual:true` 人工修正保留） |
| `node scripts/process-portraits.mjs` | resource/ 原始立绘 → public/art/valkyrie/*.webp |
| `node scripts/validate-json.mjs` | 数据一致性校验（角色/分类/立绘/卡牌） |
| `node scripts/battle-flow-check.mjs [port]` | 无头浏览器战斗流程冒烟测试（默认 3000 端口） |

## 🚀 运行

```bash
npm install
npm run dev   # http://localhost:3000
```

存档:localStorage `kemuValkyrie_meta` / `kemuValkyrie_save` / `kemuValkyrie_importedQuestions`
