# 驾考女武神 · 交规里世界净化战

《东京女武神》式卡组构筑肉鸽 × 科目一答题。驾考之城被「违章之暗」侵蚀——作为驾校学员，与 4 名女武神并肩作战，用科目一知识净化里世界！

## ✨ 功能特性

- **关卡剧情制**：4 大关（违停之街 → 超速狂飙 → 迷雾之夜 → 信号崩坏），每关随机地图 + 章节 Boss；通关解锁下一名学员；4 关全通后进入更高难度的下一周目（无限）
- **剧情对白过场**：关卡间立绘 + 打字机对白（可跳过），角色通过剧情解锁：赤红(初始·法规) → 蔚蓝(信号) → 白银(安全) → 深夜(文明)
- **答题战斗**：答对科目一题目攒指令 → 打出驾驶技能卡 → 泄能攻击 → 敌方按意图反击
- **四大板块卡牌**：64 张驾驶主题技能卡——⚖️ 法规(制裁) · 🚦 信号(控制) · 🛡️ 安全(守护) · 🌸 文明(异常)
- **板块联动**：打某板块牌 → 队伍中该板块学员联动出击
- **点火觉醒**：「神秘车库」拔钥匙觉醒——第二板块 + 领队 + 必杀槽（出满 9 张牌送 0 费必杀卡）
- **三人小队**：随剧情凑齐 3 人，独立血量、战斗切换、阵亡自动换人
- **题库板块分类**：1034 道真题按四大板块自动分类，战斗中 50% 概率按牌组主打板块抽题
- **科目一模拟考试**：100 题 / 45 分钟 / 90 分合格 · 错题本 · 学习中心 · 题库导入

## 🎮 玩法

1. 「新的冒险」→ 序章剧情 → 第 1 章地图（赤红单骑出击）
2. 地图选路 → 战斗：答题攒指令 → 打牌（联动 + 攒必杀）→ 结束回合
3. 击败章节 Boss → 章节结算剧情 → 解锁新学员 → 下一章（全员回满血）
4. 4 章全通 → 下一周目难度提升，冲击最高分

## 🖼 立绘素材管线

- 原始素材（AI 生成稿）放 `resource/characters/{角色名}/`（一名角色一个文件夹，含 portrait 主图 + 多张动作图）与 `resource/enemies/{Boss名}/`，不入 git
- **去背景**：`python scripts/remove-bg.py`（rembg/u2netp）→ 输出透明 PNG 到 `resource_nobg/`
- **映射与压缩**：编辑 `scripts/portrait-map.json`（文件名 → 角色 id 与动作类型），运行 `node scripts/process-portraits.mjs` → 输出 `public/art/valkyrie/{id}.webp`（480×640 主立绘）与 `{id}_{attack|hurt|skill|ult}.webp`（战斗动作图，攻击/受击时自动切换）+ `data/portraits.json`
- 手动替换单张：直接覆盖 `public/art/valkyrie/{id}.webp` 即可，无需改代码

## 📜 脚本

| 脚本 | 作用 |
|---|---|
| `python scripts/remove-bg.py` | resource/ 去背景 → resource_nobg/ |
| `node scripts/process-portraits.mjs` | 立绘压缩/裁切/生成 portraits.json |
| `node scripts/classify-questions.mjs` | 题库四大板块分类（支持 manual 人工修正） |
| `node scripts/validate-json.mjs` | 数据一致性校验（角色/剧情/分类/立绘/卡牌） |
| `node scripts/battle-flow-check.mjs [port]` | 无头浏览器冒烟测试 |

## 🛠 技术栈

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · zustand 5（localStorage 持久化，键名 `kemuValkyrie_*`）· three.js（3D 战斗舞台）· 纯 CSS 日漫画风 · Web Audio 程序化音效 · 纯客户端无后端

## 🚀 运行

```bash
npm install
npm run dev   # http://localhost:3000
```
