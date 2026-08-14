# 驾考女武神 · 更新计划文档（v2）

> 状态：待确认执行。本文档对应 2026-08-14 讨论后采纳的改进项，执行前请通读，标注【待确认】的条目会在开工前由作者拍板。

## 采纳清单总览

| 编号 | 类别 | 内容 |
|---|---|---|
| A1 | 修复 | 养成升级封顶（10 级） |
| A2 | 修复 | 商店移除卡牌改为自选 |
| A3 | 修复 | 敌方减伤改为「有回合限制」的减益（下限 40%） |
| A4 | 修复 | 错题本语义统一 ✅已确认：答对即移出 |
| A5 | 新系统 | 魔物「净化收服」系统 ✅已确认：击败后自动概率收服，仅图鉴收集+奖励 |
| B1 | 战斗 | 答题限时：每题 15 秒（迷雾 Boss 10 秒） |
| B2 | 战斗 | 敌方意图多样化（攻击/防御/连环/蓄力） |
| B3 | 战斗 | 9 个章节 Boss 专属机制 |
| B4 | 战斗 | 精英词缀（= A5 之外的新系统） |
| C1 | 留存 | 成就系统（16 项，奖励养成金币） |
| C2 | 留存 | 存档导出/导入 |
| D1 | 表现 | 敌方攻击动画接线 + 受击闪红 + 命中震动 |
| D2 | 表现 | BGM / 音效独立音量滑块 |
| D3 | 工程 | PWA 离线（service worker） |
| D4 | 工程 | GitHub Actions CI（build + lint） |

---

## A. 修复项

### A1 养成升级封顶
- 现状：`MAX_UPGRADE_LEVEL = 10` 已定义但 `tryUpgradeHp/tryUpgradeAtk` 从不检查，可无限升级。
- 改动：两个升级动作在 `level >= 10` 时 toast「已达最高等级」并返回；BankScreen 按钮显示「已满级」。
- 文件：`lib/store.ts`、`components/screens/BankScreen.tsx`。

### A2 商店移除卡牌改为自选
- 现状：`removeDeckCard` 花 75 金币**随机**删一张。
- 改动：点击「移除卡牌」弹出牌组选择模态（Modal 新增 `removeCard` 类型），玩家自选一张删除；仍限「至少保留 5 张」与金币校验。
- 文件：`lib/store.ts`、`lib/types.ts`（ModalState）、`components/ui/Modal.tsx`、`components/screens/ShopScreen.tsx`、`app/cards.css`（少量样式）。

### A3 敌方减伤改为有回合限制
- 现状：多张 `enemyWeak` 卡乘法叠加，一回合内可把敌方伤害压到接近 0；且每回合结束自动归 1，无跨回合策略价值。
- 改动：
  - `enemyWeak` 施加时记录 `enemyWeakTurns = 2`（重复施加刷新为 2，乘算继续累加但 **总削减下限 40%**，即 `enemyAtkMult ≥ 0.4`）；
  - 每回合结束 `enemyWeakTurns -= 1`，归零时 `enemyAtkMult` 恢复 1（不再无条件重置）；
  - 卡牌描述保持「敌方伤害-x%」不变。
- 文件：`lib/battle.ts`（`endTurn`）、`lib/cards.ts`（`applyCardFx`）、`lib/types.ts`（RunState 加 `enemyWeakTurns`）、`lib/save.ts`（存档缺省填充）。

### A4 错题本语义统一 ✅已确认：答对即移出
- 现状：战斗答对 → 从错题本**删除**；模拟考试 → **只增不删**。
- 改动：全局统一「答对即移出错题本」——考试交卷时，本次答对的题若在错题本中则自动移除；答错只增。错题本页面仍可手动清理。
- 文件：`lib/store.ts`（`recordExamResult`）、`components/screens/WrongScreen.tsx`（展示规则说明文案）。

### A5 魔物净化收服系统 ✅已确认：击败后自动概率收服，仅图鉴收集+奖励
- 现状：`enemyCaptureRate`、`RARITY_CAPTURE`、`caught` 音效、`badge-caught` 美术全是死代码。
- 设计（已确认）：
  - 触发：**击败普通魔物（非 Boss、非精英）后自动判定**，概率 = `enemyCaptureRate`（c:70% / u:45% / r:25% / l:8%）；精英战斗判定时概率 ×0.6（更难收服）；
  - 成功：魔物图鉴标记「已收服」+ 一次性奖励（金币 40 + 养成金币 15）+ 音效 `caught` + toast「✨ 净化成功！XX 已收服」；
  - 重复收服：只给少量金币（20）；
  - Boss 不可收服；已收服魔物在战斗中正常出现，不影响玩法。
  - meta 新增 `caughtMonsters` 字段（跨局，`loadMeta` 缺省填充）。
- 文件：`lib/store.ts`（`endBattle` 内判定）、`lib/types.ts`、`lib/save.ts`、`components/screens/DexScreen.tsx`（已收服徽章）、`lib/audio.ts`（复用 caught 音效）。

---

## B. 战斗深度

### B1 答题限时 15 秒(迷雾 Boss 10 秒)✅已调优
- 每道题 15 秒倒计时（所有战斗含 Boss；迷雾 Boss 迷障回合 10 秒），答对后下一题重新计时；最后约 30% 时间倒计时条变红脉冲。
- 超时 = 按答错处理：连击清零、展示正确答案后进入出牌阶段（答错/超时**不再反伤**）；飘字「⏰ 超时！」。
- 计时器为内存态（不写存档），读档续战时当前题重新计时。

### B2 敌方意图多样化
- `EnemyIntent` 扩展为 4 种，`startTurn` 按权重抽取并明牌展示：
  | 意图 | 权重 | 行为 |
  |---|---|---|
  | 攻击 | 60% | 现有伤害 |
  | 防御 | 15% | 敌方获得格挡 10~20，攻击伤害减半 |
  | 连环 | 15% | 2 段攻击，每段 60% 伤害 |
  | 蓄力 | 10% | 本回合不攻击，下回合 1.8 倍伤害（明牌预告） |
- Boss 沿用（其专属机制可覆盖或混合意图）。
- 文件：`lib/types.ts`（EnemyIntent）、`lib/battle.ts`（`startTurn`/`endTurn`）、`components/screens/BattleScreen.tsx`（意图文案/图标）、`lib/save.ts`。

### B3 章节 Boss 专属机制
| 章 | Boss | 机制 |
|---|---|---|
| 1 违停之街 | 违停障碍怪 | 每回合结束给自己 +格挡（违停车越堆越多） |
| 2 超速狂飙 | 超速狂魔 | 每回合攻击 +2 叠加；「限速减速(para)」期间叠加暂停并每回合 -2 |
| 3 迷雾之夜 | 迷雾幽灵 | 隐藏伤害数字意图；每 3 回合对你施加 1 回合「远光眩目(confuse)」 |
| 4 路障要塞 | 路障巨兽 | 每 3 回合竖起「路障」（+40 格挡，格挡存在时受伤减半） |
| 5 红灯禁区 | 红灯魔 | 每 3 回合「红灯暴怒」：本回合攻击 +50%（明牌） |
| 6 迷途雾境 | 雾境行者 | 每 4 回合「雾隐」1 回合（闪避你的攻击，被「远光眩目」破除） |
| 7 残骸废墟 | 残骸机甲 | HP ≤ 40% 狂暴：攻击 ×1.5 且每回合回复 3% HP |
| 8 信号崩坏 | 信号崩坏体 | 每 3 回合干扰你的手牌（随机一张本回合费用 +1，明牌提示） |
| 9 幽灵堵城 | 拥堵车流幽灵 | 保留二阶段；每 2 回合「车流淤积」+格挡并攻击附带 1 回合「限速减速」 |
- 实现：新建 `lib/bossMechanics.ts`（按 bossId 配置钩子：`onTurnStart/onTurnEnd/onPlayerAttack`），战斗内由 `startBattleOn/startTurn/endTurn/playCardOn` 调用；BattleScreen 展示机制标签。
- 文件：`lib/bossMechanics.ts`（新）、`lib/battle.ts`、`lib/types.ts`、`components/screens/BattleScreen.tsx`、`app/cards.css`。

### B4 精英词缀
- 词缀池（精英节点必带 1 个；loop ≥ 2 精英带 2 个；loop ≥ 3 普通怪 20% 概率带 1 个）：
  | 词缀 | 效果 |
  |---|---|
  | 荆棘 | 反击：你对其造成伤害时反伤 25%（无视格挡） |
  | 狂暴 | 攻击 ×1.3 |
  | 厚甲 | 开局 30 格挡，每回合 +10 |
  | 迅捷 | 每场战斗首回合多攻击一次 |
  | 复苏 | 首次阵亡时复活 50% HP（每场 1 次） |
- `startBattleOn` 按节点类型/周目投掷词缀存入 `run.enemyAffix: string[]`；BattleScreen 显示词缀徽章。
- 文件：`lib/battle.ts`、`lib/types.ts`、`lib/save.ts`、`components/screens/BattleScreen.tsx`。

---

## C. 留存与元进度

### C1 成就系统
- 16 项成就，达成即弹 toast + 发放养成金币；新「🏅 成就」面板（标题屏入口，复用 dex 样式）。
  | 成就 | 条件 | 奖励 |
  |---|---|---|
  | 初出茅庐 | 完成第 1 场战斗 | 30 |
  | 首胜魔王 | 首次通关任意章节 | 80 |
  | 一周目制霸 | 通关全部 9 章 | 300 |
  | 三周目老司机 | 完成第 3 周目 | 500 |
  | 连击新手 | 单局连击 ≥ 10 | 50 |
  | 连击大师 | 单局连击 ≥ 20 | 150 |
  | 无伤传说 | 无伤通关任一章节 | 200 |
  | 合格学员 | 模拟考试首次 ≥ 90 分 | 100 |
  | 满分学霸 | 模拟考试满分 | 300 |
  | 净化专员 | 首次收服魔物 | 80 |
  | 图鉴收藏家 | 魔物图鉴全收服 | 400 |
  | 卡牌大师 | 集齐全部卡牌 | 300 |
  | 腰缠万贯 | 单局持有金币 ≥ 300 | 50 |
  | 答题狂人 | 累计答对 ≥ 500 题 | 200 |
  | 高分车神 | 单局得分 ≥ 5000 | 150 |
  | 全员集结 | 解锁全部学员 | 250 |
- meta 新增 `achievements: Record<string, boolean>`；判定钩子挂在现有 store 动作上（战斗结束/考试交卷/收服/解锁等）。
- 文件：`lib/achievements.ts`（新：定义 + 判定）、`lib/store.ts`（钩子 + 发奖）、`lib/types.ts`、`lib/save.ts`、`components/screens/AchievementsScreen.tsx`（新）、`components/screens/TitleScreen.tsx`（入口）、`app/art.css`。

### C2 存档导出/导入
- 设置页新增「导出存档」（复制 base64 码）/「导入存档」（粘贴覆盖，二次确认）。包含 meta、当前 run、导入题库；附版本号字段便于未来迁移。
- 文件：`lib/save.ts`（`exportSave/importSave`）、`components/screens/SettingsScreen.tsx`、`lib/store.ts`。

---

## D. 表现与工程

### D1 敌方攻击动画接线 + 受击闪红
- 现状：`BattleFX.attack("enemy")` 已实现前冲/弹道/命中粒子/镜头震动，但 BattleScreen 无条件在结束回合后 500ms 播放——敌方睡着/混乱自伤时也会播放，且玩家侧无受击闪红。
- 改动：
  - `endTurnAction` 返回 `EndTurnResult`，BattleScreen 仅在 `enemyDmg > 0` 时播放敌方攻击动画；
  - `fx3d.ts` 命中目标时给立绘加红色闪光（材质 tint 短 tween），配合现有震动；
  - 答错反伤动画同样接 `counterDmg > 0` 判断。
- 文件：`lib/store.ts`、`components/screens/BattleScreen.tsx`、`lib/fx3d.ts`。

### D2 BGM / 音效独立音量滑块
- meta 新增 `bgmVol`/`sfxVol`（0~1，默认 0.6/0.8）；设置页两个滑块（用现成 `slider-track.webp` 素材），实时调 `AudioEngine.setBgmVol/setSfxVol`；总开关保留。
- 文件：`lib/types.ts`、`lib/save.ts`、`lib/store.ts`、`components/screens/SettingsScreen.tsx`、`components/GameApp.tsx`、`app/globals.css`。

### D3 PWA 离线
- 新增 `public/sw.js`：运行时缓存（cache-first，页面壳 + 静态资源 + 字体），同源 fetch 缓存；`app/layout.tsx` 注册（仅生产环境）；manifest 已有。
- 文件：`public/sw.js`（新）、`app/layout.tsx`。

### D4 GitHub Actions CI
- 新增 `.github/workflows/ci.yml`：push/PR 触发 `npm ci` → `npm run lint` → `npm run build`，失败即拦截（本次 Cloudflare 的 TS 错误本可被它提前拦下）。
- 文件：`.github/workflows/ci.yml`（新）。

---

## 兼容性与风险

- 所有 meta/run 新字段（`enemyWeakTurns`、`caughtMonsters`、`achievements`、`bgmVol/sfxVol`、`enemyAffix`）均走缺省填充，**老存档无需清档**，`loadMeta/loadRun` 读旧档自动补默认值。
- B3 Boss 机制涉及战斗数值钩子，改动集中在 `lib/battle.ts` 与新增 `lib/bossMechanics.ts`，出牌/答题路径不动。
- B1 计时器不落盘，读档后重新计时，无存档格式风险。
- D3 service worker 在 dev 环境不注册（避免 Turbopack HMR 被缓存干扰）；上线后若发现旧缓存，提供「跳过等待 + 自动更新」逻辑。
- 全部完成后：本地 `npm run build` 通过 → 推送 → Cloudflare 新部署（不重试旧部署）验证。

## 验收标准

1. 升级到 10 级后按钮变「已满级」，无法继续扣金币；
2. 商店移除卡牌可自选，删卡后牌组 ≥ 5 张；
3. 连续打减伤卡，敌方攻击不低于原伤害 40%，2 回合后恢复；
4. 战斗每题 15 秒倒计时（迷雾 Boss 10 秒），超时按答错处理；
5. 敌方意图出现 4 种且明牌；蓄力后下回合 1.8 倍；
6. 9 个 Boss 各显示机制标签且行为生效；
7. 精英怪显示词缀且行为生效；
8. 击败普通魔物后自动按概率判定收服，图鉴出现「已收服」徽章，重复收服给金币；
9. 成就面板可查 16 项成就并领奖；
10. 设置页可导出/导入存档、调 BGM/SFX 音量；
11. 敌方攻击仅在造成伤害时播放动画，命中红色闪光 + 震动；
12. 部署后手机可添加到主屏离线游玩；
13. CI 在 push 后自动跑 lint + build。
