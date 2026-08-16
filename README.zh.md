# dsh-finance

> [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的金融数学工具箱——贷款月供与摊销、复利增长测算、名义/有效利率换算。零运行时依赖、纯算术、完全确定性。

智能体算钱总出错。「30 万美元、4% 利率、30 年期，月供多少？」「1000 元本金、5% 月复利、10 年后有多少？」——复利与 PMT 公式正是 LLM 最容易心算失误的地方，而算错就是财务决策出错。本插件把这些计算变成确定性的工具调用。

## 工具

| 工具 | 说明 |
|------|------|
| `loan_payment` | 固定利率贷款月供（PMT）→ 月供、总还款、总利息。可选等额本息摊销表（上限 360 行）和/或每月固定额外还本（缩短期限、节省利息）。 |
| `compound_growth` | 一次性本金 + 可选每月定投的终值测算（普通年金，月末投入）。支持日/月/季/半年/年/连续复利。可选逐年明细（上限 60 行）。 |
| `rate_convert` | 名义利率（APR）↔ 有效年利率（EAR）互转，支持连续复利（EAR = e^r − 1）。 |

## 安装

```sh
# 安装到 web profile（dsh plugin 没有默认 profile，必须带 --profile）
dsh plugin --profile web add github:TYEclipse/dsh-finance
```

验证挂载：

```sh
dsh --profile web --dump-config | grep '=='
```

## 使用示例

```
30 万美元、4% APR、30 年期的月供是多少？
→ loan_payment { principal: 300000, annual_rate_percent: 4, months: 360 }
→ monthly_payment 1432.25，total_interest 215610，total_paid 515610

本金 1000 元、每月定投 100 元、5% 月复利、10 年后有多少？
→ compound_growth { principal: 1000, annual_rate_percent: 5, years: 10, compounding: "monthly", contribution_per_month: 100 }
→ future_value 17175.24（本金投入 13000，利息 4175.24）

贷款广告写着「12% 名义利率、按月复利」，实际年化是多少？
→ rate_convert { rate_percent: 12, input_kind: "nominal", compounding: "monthly" }
→ output_rate_percent 12.682503（有效年利率 EAR）
```

## 语义约定

- **金额舍入**：仅在输出边界四舍五入到分；内部摊销迭代保持全精度，末期还款自动调整使余额精确归零。
- **提前还款**：合同月供不变，期限缩短；工具返回 `payoff_months`、`months_saved`、`interest_saved`。
- **复利频率**：`loan_payment` 按惯例使用 APR 月复利（按揭标准）；`compound_growth` 先把任意频率换算为有效月利率，定投按月精确复利；`continuous` 使用 e^rt。
- **零利率**精确处理（无除零）：月供 = 本金 ÷ 期数；终值 = 本金 + 定投。
- **输入校验**：所有工具先校验参数，非法输入返回 `valid: false` 与明确原因，绝不抛异常。

## 设计边界

- 不含手续费、税费、保险、托管——纯摊销数学。
- 摊销表上限 360 行、逐年明细上限 60 行（见 `truncated` 标记）。
- 不做货币换算——所有金额为同一货币单位。
- 低于 −100% 的利率视为无意义输入而拒绝，其余精确计算。

## 许可证

MIT
