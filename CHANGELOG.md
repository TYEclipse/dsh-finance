# CHANGELOG · dsh-finance

> 版本口径：patch 修 bug/补测试｜minor 新增用户可见功能｜major 破坏性变更。安装：`dsh plugin --profile web add github:TYEclipse/dsh-finance`

## [0.3.0] — 2026-09-22
### Minor · R46
- **新增 `savings_goal`｜new `savings_goal`**：储蓄目标规划。给定每月储蓄额算出还要几个月达标（`months_to_goal`、期末余额、累计投入、利息收益）；给定期限（月数）算出每月必须存多少（`required_monthly_contribution`，年金闭式**向上取整到分**，并用该精确储蓄额重新模拟出 `projected_balance`）；两者都给时判定 `on_track`。储蓄额与收益率都为零导致缺口填不满时如实报 `unreachable`（100 年上限），不给编造月数。
  Goal-based saving: months until a target is reached, or the contribution a deadline requires (annuity closed form rounded up to the cent, with the projection simulated from that exact payment), plus an `on_track` verdict when both are given. Dead-end plans are reported as `unreachable` instead of an invented month count.
- **新增 `inflation_adjust`｜new `inflation_adjust`**：购买力换算。今天金额的未来名义成本、未来名义金额的 today's value；给出名义收益率时用精确费雪关系 `(1+名义)/(1+通胀) − 1` 算实际收益率，并同时给出名义与实际终值。支持通缩（负通胀）与小数年限（0.5 = 半年），实际收益率内部不舍入以免污染终值。
  Purchasing power: future cost, present value, and — with a nominal return — the exact Fisher real return plus nominal/real future values side by side. Handles deflation and fractional horizons; the real rate stays unrounded internally.
- **文档与可复现锚点｜docs & reproducible anchors**：README 双语补齐两个新工具、语义与用例；`test/oracle/anchors.py` 随仓提交（独立 Python oracle，逐条打印测试里每一个数值锚点），新测试文件带 `ORACLE:` 出处标记。
  Bilingual README updated; the independent Python oracle now ships with the repo and reproduces every numeric anchor the tests assert.
- 测试 97 → 115 条；覆盖率 87.62% → 90.68%（棘轮自动上调基线）。

## [0.2.3] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.2] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.1] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

