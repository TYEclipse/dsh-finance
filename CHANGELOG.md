# CHANGELOG · dsh-finance

> 版本口径：patch 修 bug/补测试｜minor 新增用户可见功能｜major 破坏性变更。安装：`dsh plugin --profile web add github:TYEclipse/dsh-finance`

## [0.5.0] — 2026-11-01
### Minor · R86
- **新增 `refinance_analysis`｜new `refinance_analysis`**：继续还老贷款还是做再融资。给定剩余余额、当前利率与剩余月数、新利率（可选新期限）、过户手续费（可选择滚进新余额），同时给出**两个视角**——月供视角（新月供、节省额、手续费几个月回本）与利息视角（`horizon_months` 内的利息差、两个期限的合同总额差）。期限一变两个视角就会打架，所以返回 `verdict`（`cheaper_every_way` / `payment_down_interest_up` / `payment_up_interest_down` / `not_better`）与一句说明，而不是一个乐观数字：`6%→5%、20 年拉到 30 年` 的经典陷阱会如实报「月供降 538.83，但利息多 63936」。月供没有下降时**不给**回本月份（字段缺席，不给一个巨大数字）。
  Keep the current loan or refinance it? Reports the payment view (new payment, months until closing costs are repaid) and the interest view (interest saved over the horizon, and over both full terms) side by side, because the two disagree as soon as the term changes. Returns a verdict plus a note rather than one optimistic number — stretching 20 years to 30 at 6% → 5% is reported as "payment down 538.83, interest up 63,936". No break-even month is reported when the payment does not fall.
- **oracle 扩 F 区｜oracle section F**：`test/oracle/anchors.py` 新增 8 个再融资用例（纯降息、手续费滚入、利率变差、缩短期限、零手续费、视野短于回本期、零利率、拉长期限），逐条打印测试断言的每个数值；`--check` 增补 **85 项自检**——回本月的最小性（`n` 月够、`n−1` 月不够）、`amount_financed`/`upfront_cash`/`cash_saved` 的定义式恒等，以及**闭式余额与逐月模拟的双路对拍**（TS 走闭式、oracle 走模拟，两条代码路径必须一致）。
  Eight new cases printed value by value, plus 85 self-check assertions: break-even minimality from the definition, the roll-in/upfront identities, and a closed-form-vs-simulation cross-check (the plugin takes the closed form, the oracle simulates month by month).
- **口径｜convention**：`monthly_savings`、回本月份与 `horizon.*` 都由**已报告**的数字推出，屏幕上手算能对上；`horizon.interest_saved` 是摊销视角（末月零头已扣除），`lifetime_interest_saved` 取自合同总额，两者在"月供向上取整让贷款早还清"时会差几分钱——差额写进 `note`，不藏着。
  Savings, break-even and the horizon figures are derived from the reported numbers so they reconcile on screen; the horizon interest is the amortisation view (final-month dust removed) while the lifetime figure comes from the contract totals, and the cents-level difference is disclosed in `note`.
- **测试与覆盖｜tests & coverage**：测试 133 → **157** 条（新增 24 条），覆盖率 92.67% → **93.74%**（棘轮自动上调基线）；README 双语补齐（工具表、两个用法示例、语义与限制各一条）。

## [0.4.0] — 2026-10-13
### Minor · R68
- **新增 `debt_payoff`｜new `debt_payoff`**：多笔债务还款规划。给定 1–10 笔债务（余额、年利率、最低还款）与一个月度预算，逐月模拟还款：先付清全部最低还款（合同义务），剩余预算集中打一笔债，并对**雪崩法**（利率最高优先）与**雪球法**（余额最小优先）两种顺序都跑完整模拟。输出还清月数、总还款、总利息、各债**实际**清零顺序（含每笔的利息与还款额）、策略优先级、两种顺序的对比与谁更省（`best_strategy`、`interest_saved_by_best`）。预算只够最低还款且低于月息时如实报 `debt_free: false` + 说明，绝不编造月数。
  Multi-debt payoff planning: minimums first, then the leftover budget attacks one debt at a time, simulated month by month for both avalanche (highest rate first) and snowball (smallest balance first). Reports months to debt-free, totals, the order balances actually clear in, and which ordering is cheaper. A plan that never clears is reported honestly instead of inventing a month count.
- **oracle 迁移完成｜oracle migration complete**：`test/oracle/anchors.py` 扩为八区（贷款 / 复利 / 利率 / 现金流 / 退休 / 储蓄 / 通胀 / 债务），独立实现全部闭式与逐月模拟，并新增 `--check` 自检（51 项：公开值当尺子 + 结构不变量 + 单债闭式与模拟对拍 + 两种策略的利息不等式）。仓库全部 7 个测试文件均带 `ORACLE:` 出处标记，期望值出处门禁全绿。
  The committed oracle now covers every test file (loan, growth, rates, cash flow, retirement, savings, inflation, debt) with a real `--check` self-test; all 7 test files carry the `ORACLE:` marker.
- **修复一处陈旧锚点｜stale anchor fixed**：迁移时 oracle 抓出 `compound_growth` 的定投终值锚点写成 17175.23（真值 17175.2374 → 17175.24），旧用例因容差为 1 位小数而长期放行；现改为 17175.24（2 位小数容差）并补上 `interest_earned` 断言。
  The oracle caught a stale anchored value in the growth test (17175.23 vs the true 17175.24, previously passing only because of a loose tolerance); tightened and extended.
- **口径｜convention**：`interest_saved_by_best` 由两个已报告（分位）总额相减得出，保证读者在界面上手算能对上——与"内部全精度、只在输出边界舍入"一致。
  `interest_saved_by_best` is derived from the two reported totals so the saving reconciles with what the user sees.
- 测试 115 → 133 条；覆盖率 90.68% → 92.67%（棘轮自动上调基线）。

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

