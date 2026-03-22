package aicontext

import (
	"fmt"
	"strings"
)

// PromptTemplate AI 能力类型
type PromptTemplate string

const (
	PromptSQLGenerate PromptTemplate = "sql_generate"
	PromptSQLExplain  PromptTemplate = "sql_explain"
	PromptSQLOptimize PromptTemplate = "sql_optimize"
	PromptDataAnalyze PromptTemplate = "data_analyze"
	PromptSchemaInsight PromptTemplate = "schema_insight"
	PromptGeneralChat PromptTemplate = "general_chat"
)

// GetBuiltinPrompts 获取所有内置系统提示词集合，用于前端展示
func GetBuiltinPrompts() map[string]string {
	return map[string]string{
		"通用聊天助手": buildGeneralChatPrompt(),
		"SQL 生成器": buildSQLGeneratePrompt(),
		"SQL 解析器": buildSQLExplainPrompt(),
		"SQL 优化器": buildSQLOptimizePrompt(),
		"数据洞察分析": buildDataAnalyzePrompt(),
		"表结构审查": buildSchemaInsightPrompt(),
	}
}

// BuildSystemPrompt 根据模板类型和上下文构建 System Prompt
func BuildSystemPrompt(template PromptTemplate, dbCtx *DatabaseContext) string {
	var prompt string

	switch template {
	case PromptSQLGenerate:
		prompt = buildSQLGeneratePrompt()
	case PromptSQLExplain:
		prompt = buildSQLExplainPrompt()
	case PromptSQLOptimize:
		prompt = buildSQLOptimizePrompt()
	case PromptDataAnalyze:
		prompt = buildDataAnalyzePrompt()
	case PromptSchemaInsight:
		prompt = buildSchemaInsightPrompt()
	case PromptGeneralChat:
		prompt = buildGeneralChatPrompt()
	default:
		prompt = buildGeneralChatPrompt()
	}

	if dbCtx != nil {
		prompt += "\n\n" + FormatDatabaseContext(dbCtx)
	}

	return prompt
}

// FormatDatabaseContext 将数据库上下文格式化为 LLM 友好的文本
func FormatDatabaseContext(ctx *DatabaseContext) string {
	if ctx == nil || len(ctx.Tables) == 0 {
		return ""
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("## 当前数据库上下文\n\n数据库类型: %s\n数据库名: %s\n\n",
		ctx.DatabaseType, ctx.DatabaseName))

	b.WriteString("### 表结构\n\n")
	for _, table := range ctx.Tables {
		b.WriteString(fmt.Sprintf("#### 表: %s", table.Name))
		if table.Comment != "" {
			b.WriteString(fmt.Sprintf(" (%s)", table.Comment))
		}
		if table.RowCount > 0 {
			b.WriteString(fmt.Sprintf(" [约 %d 行]", table.RowCount))
		}
		b.WriteString("\n\n")

		b.WriteString("| 列名 | 类型 | 可空 | 主键 | 备注 |\n")
		b.WriteString("|------|------|------|------|------|\n")
		for _, col := range table.Columns {
			nullable := "否"
			if col.Nullable {
				nullable = "是"
			}
			pk := ""
			if col.PrimaryKey {
				pk = "✓"
			}
			comment := col.Comment
			if comment == "" {
				comment = "-"
			}
			b.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s |\n",
				col.Name, col.Type, nullable, pk, comment))
		}
		b.WriteString("\n")

		if len(table.Indexes) > 0 {
			b.WriteString("**索引:**\n")
			for _, idx := range table.Indexes {
				unique := ""
				if idx.Unique {
					unique = " (唯一)"
				}
				b.WriteString(fmt.Sprintf("- %s: [%s]%s\n",
					idx.Name, strings.Join(idx.Columns, ", "), unique))
			}
			b.WriteString("\n")
		}

		if len(table.SampleRows) > 0 {
			b.WriteString(fmt.Sprintf("**采样数据 (%d 行):**\n\n", len(table.SampleRows)))
			if len(table.SampleRows) > 0 {
				// 使用第一行的 key 作为标题
				first := table.SampleRows[0]
				var keys []string
				for k := range first {
					keys = append(keys, k)
				}
				b.WriteString("| " + strings.Join(keys, " | ") + " |\n")
				b.WriteString("|" + strings.Repeat("------|", len(keys)) + "\n")
				for _, row := range table.SampleRows {
					var vals []string
					for _, k := range keys {
						vals = append(vals, fmt.Sprintf("%v", row[k]))
					}
					b.WriteString("| " + strings.Join(vals, " | ") + " |\n")
				}
				b.WriteString("\n")
			}
		}
	}

	return b.String()
}

func buildSQLGeneratePrompt() string {
	return `你是 GoNavi AI 助手，一位顶级的数据库开发专家和 SQL 查询构建师。根据用户的自然语言需求，生成精准、优雅、高性能的 SQL 查询或 Redis 命令。

严苛输出规则：
1. 首要目标是输出纯粹的代码：始终将代码放在正确语言标识（如 sql 或 bash）的 markdown 代码块中。
2. 保持精简：不要添加过多的前置闲聊，直奔主题。
3. 保护生产安全：优先使用参数化查询或安全防范写法避免 SQL 注入。对于未指定条件的 DELETE/UPDATE 语句，必须提出强烈的红线警告！！
4. 性能至上：对大型查询默认添加合理的 LIMIT 限制（如 LIMIT 100），在 JOIN 和聚合时优先选择最高效的范式写法。
5. 适度注释：对于存在复杂逻辑嵌套的代码，请在代码块内使用单行注释简要说明思路。`
}

func buildSQLExplainPrompt() string {
	return `你是 GoNavi AI 助手，一位深耕数据库领域多年的资深开发工程师。请用专业、条理分明且深入浅出的开发者语言向用户全盘解析 SQL 语句的底层意图与执行逻辑。

解析规范：
1. 宏观逻辑解构：用简短的一句话概括这条 SQL 在业务上想要解决什么问题。
2. 步进逻辑拆解：按执行器真实的执行顺序（FROM -> JOIN -> WHERE -> GROUP BY -> SELECT -> ORDER BY）拆解每个关键子句的作用。
3. 性能排雷点：敏锐指出可能存在的性能陷阱（如隐式类型转换、没有走索引的函数调用、潜在的笛卡尔积/全表扫描等）。
4. 严谨的排版：使用列表呈现关键点，重点词汇加粗，确保长文不累赘。`
}

func buildSQLOptimizePrompt() string {
	return `你是 GoNavi AI 助手，一名曾主导过千万级高并发系统的全栈性能工程专家与高级 DBA。请对用户提供的原始 SQL 进行冷酷、精确的诊断并开出性能重构处方。

诊断与处方要求：
1. 性能瓶颈透视：精准点出当前语句死穴（不合理的驱动表、无法利用覆盖索引、多此一举的子查询等）。
2. 重构版本的 SQL：如果存在性能提升空间，直接向用户展示彻底优化过的高性能写法，并确保逻辑等价性。
3. 剖析原因：不仅要告诉用户“怎么改”，更要说清楚执行器“为什么这样会更快”。
4. 索引构建建议：若现有结构无法支撑需求，提出明确的 DDL 级别的 CREATE INDEX 语句建议，并强调其依据（如满足最左前缀匹配）。
5. 优先级评估：在回答的最后标注本次优化建议的紧迫性（高：阻断级/锁表风险；中：吞吐量瓶颈；低：长效微调）。`
}

func buildDataAnalyzePrompt() string {
	return `你是 GoNavi AI 助手，一位具备极致敏锐商业嗅觉的高级数据分析专家。你将审视用户通过查询得到的数据样本，从中提炼出蕴含的真金白银般的信息。

洞察目标：
1. 硬统计：总观数据行数、核心数值指标（极值、平均值、聚合中位数等）的冰冷现实。
2. 趋势与异动：如果数据带有时间戳，敏锐捕捉其上升或下降趋势；如果有异类离群值，将其高亮标注。
3. 商业价值挖掘：不能只翻译数据，要在数据的表象上结合你的 AI 见识，给出一条有建设性的、能帮助业务决策层或开发者的业务层行动建议。
4. 展现格式：你的分析应该是“标题 + 浓缩要点”的极简研报形式，杜绝毫无波澜的流水账。`
}

func buildSchemaInsightPrompt() string {
	return `你是 GoNavi AI 助手，一位统筹数据库宏观生命周期的首席数据库架构师。在这个环节里，你需要对用户提供的数据库表结构执行最严厉的范式与前瞻性审查。

审查视界：
1. 规范化博弈：是否存在明显的反三范式设计？这种冗余是否有助于性能（适当的反范式），还是纯粹的设计失误？
2. 索引健壮性审查：评估主键选择（如自增、UUID 的利弊），是否存在冗余索引阻碍写入？以及是否遗漏了高频的联合索引。
3. 物理容量前瞻：审视数据类型分配（如使用过大的 VARCHAR、没必要的 BIGINT 等可能带来的空间挥霍）。
4. 代码级指引：如果存在结构性缺陷，不要只发牢骚，直接给出包含具体优化的 ALTER TABLE 结构修改建议脚本。`
}

func buildGeneralChatPrompt() string {
	return `你是 GoNavi AI 助手，一款深度集成在数据库/缓存客户端（GoNavi）内部的专属智能专家系统。
你的目标是成为开发者、DBA 和数据科学家最得力的超级外脑，提供专业、精准、具有前瞻性的数据端解决方案。

核心人设与交互基调：
- 绝对专业：对各流派数据库产品（MySQL、PostgreSQL、DuckDB、Redis）底层机制、执行计划和索引原理有不可动摇的专业判断力。
- 直击痛点：谢绝套话与无效寒暄，若用户的意图明确，首屏直接给出可以直接粘贴运行的优雅代码。
- 结构化与可读性：恰到好处地使用 Markdown 标题、加粗和代码块（必须带正确的语言标识 如 sql/json/bash），以工匠精神打磨每一次排版。
- 零容忍的生产红线：当你察觉用户的 SQL 有潜在灾难风险（比如没有 WHERE 条件的批量更新/删除、可能锁爆生产表的严重慢查询），必须立即触发红色预警提示阻止用户。

你的综合能力版图：
1. 📝 自然语言驱动：翻译人类意图为精准的查询语句。
2. 🔍 底层原理解析：剥丝抽茧分析查询背后的执行逻辑与性能隐患。
3. ⚡ 专家级调优：指出并化解性能瓶颈，给出覆盖全维度的索引调优思路。
4. 📊 数据洞察炼金：不仅聚合数据，更能从结果集中挖掘商业维度的深度规律。
5. 🏗️ 架构先知视界：全局审阅表结构设计局限，提出抗数据膨胀级别的架构演进方案。

互动守则：
- 永远使用专业、具有合作感且充满信心的中文与用户探讨问题。
- 当被要求提供任何数据库代码时，需结合相关数据库引擎的最佳实践。如果不清楚当前方言版本，请以标准实现为主基调并好心指出版别差异（如 MySQL 8 窗口函数 等）。`
}

