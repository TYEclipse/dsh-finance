# dsh-finance

> DeepSeek Harness (dsh) 的金融数学工具箱：贷款月供与摊销、复利增长、名义/有效利率换算、现金流分析（NPV/IRR/回收期）、退休提款规划。零运行时依赖、纯算术、完全确定性。

大模型心算金融公式极易出错——"30 万美元 4% 利率 30 年月供多少"、"这个项目的 IRR 是多少"、"我的积蓄按 4% 提款能撑 30 年吗"正是高频翻车问题。本插件把这些问题变成确定性的工具调用。

## 工具

| 工具 | 说明 |
|------|------|
| `loan_payment` | 等额本息月供（PMT）→ 月供、总还款、总利息。可选摊销表（上限 360 行）与每月固定提前还款（缩短期限、节省利息）。 |
| `compound_growth` | 一次性本金 + 每月定投的复利终值。支持日/月/季/半年/年/连续复利。可选逐年明细（上限 60 行）。 |
| `rate_convert` | 名义利率（APR）↔ 有效年利率（EAR）互转，含连续复利（EAR = e^r − 1）。 |
| `cashflow_analysis` | 任意现金流序列的 NPV（按折现率）、IRR（二分法）与简单/折现回收期。无符号变化或多重符号变化时如实报告，绝不编造数值。 |
| `retirement_plan` | 安全提款数学：给定每月提款额算耗尽时间（4% 法则一族），或给定年限算恰好耗尽余额的可持续月提款（PMT）。输出提款率、总提款额、利息收益；两者都给时判定能否撑满年限（`lasts_horizon`）。 |

## 为什么

- **专治 LLM 心算错误**——复利、PMT、EAR 换算、IRR、提款数学是幻觉高发区，本插件给出精确且经过测试的答案。
- **零运行时依赖**——纯 `Math` 运算，无网络、无文件系统、无动态执行，任何环境都安全。
- **外部锚点测试**——头条数字全部对照公开资料验证（贷款月供表、教材 EAR 值、Excel IRR 官方示例）与独立闭式脚本生成，绝不自证往返。可持续提款与贷款月供同为 PMT 闭式，互相交叉校验。

## 安装

```sh
# 装进 web profile（dsh plugin 无默认 profile——必须带 --profile）
dsh plugin --profile web add github:TYEclipse/dsh-finance
```

验证层已挂载：

```sh
dsh --profile web --dump-config | grep '=='
```

## 用法示例

```
30 万美元 4% 利率 30 年月供多少？
→ loan_payment { principal: 300000, annual_rate_percent: 4, months: 360 }
→ monthly_payment 1432.25, total_interest 215610, total_paid 515610

1000 美元起投、每月加 100、10 年、5% 月复利，最后有多少？
→ compound_growth { principal: 1000, annual_rate_percent: 5, years: 10, compounding: "monthly", contribution_per_month: 100 }
→ future_value 17175.24（投入 13000，利息 4175.24）

"12% 名义利率、按月复利"实际年利率多少？
→ rate_convert { rate_percent: 12, input_kind: "nominal", compounding: "monthly" }
→ output_rate_percent 12.682503（有效 EAR）

这个项目值得投吗？（Excel IRR 官方示例，按 8% 折现）
→ cashflow_analysis { cash_flows: [-70000, 12000, 15000, 18000, 21000, 26000], discount_rate_percent: 8 }
→ npv 1390.96, irr_percent 8.663095, payback_periods 4.15

100 万积蓄按 4% 收益每月提 4000，能撑 30 年吗？
→ retirement_plan { principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 4000, years: 30 }
→ months_to_exhaust 538.42, withdrawal_rate_percent 4.8, lasts_horizon true
→（顺带：30 年可持续月提款额为 4774.15）
```

## 语义

- **金额舍入**：只在输出边界四舍五入到分；内部迭代保持全精度，末期还款自动调平余额。
- **提前还款**：合同月供不变，期限缩短；输出 `payoff_months`、`months_saved`、`interest_saved`。
- **复利**：`loan_payment` 按房贷惯例对 APR 月复利；`compound_growth` 先把任意频率换算成有效月利率再复利，定投精确合成；`continuous` 用 e^rt。
- **现金流**：第 0 项为时点 0（通常是负的初始投入），第 t 项为期末现金流。IRR 仅在现金流恰好变号一次且存在根时给出，否则返回说明（无符号变化 / 可能不唯一）。回收期线性插值。
- **提款**：月复利、月末提款。提款额 ≤ 利息收益（W ≤ P·r）时永不耗尽（`never_exhausts: true`）。可持续提款按分位舍入后的月供摊销，与银行口径一致。
- **零利率**精确处理（无除零）：月供 = 本金 ÷ 期数；耗尽时间 = 本金 ÷ 提款额。
- **校验**：每个工具校验输入，非法时返回 `valid: false` 与具体原因，绝不抛异常。

## 限制（设计如此）

- 不含手续费、税费、保险、托管——纯摊销数学。
- 摊销表上限 360 行、逐年明细上限 60 行（见 `truncated` 标记）。
- 不做货币换算——所有金额为同一货币单位。
- 低于 −100% 的利率视为无意义输入而拒绝，其余精确计算。
- 不支持不规则周期现金流（XIRR/XNPV）——周期均匀。
- IRR 按惯例取单值：现金流多次变号时标记而非给任意一个根。

## 许可证

MIT
