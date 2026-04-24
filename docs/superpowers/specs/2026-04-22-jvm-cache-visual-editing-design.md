# JVM 缓存可视化编辑设计

## 1. 背景

当前用户在公司 Java 项目中经常把缓存或运行时状态直接保存在 JVM 内存中。出现数据脏值、缓存穿透、临时纠偏或排障时，通常只有两种方式：

- 为特定业务临时补管理接口
- 重启应用并依赖重新初始化

这两种方式都存在明显问题：

- 临时接口会污染业务代码，并带来后续维护和权限风险
- 重启应用成本高，且不适合用于精确修复单个缓存项

GoNavi 现有已具备三类可复用基础：

- 统一连接与工作台能力：`frontend/src/components/ConnectionModal.tsx`、`frontend/src/components/Sidebar.tsx`、`frontend/src/components/TabManager.tsx`
- 独立运行时能力样板：Redis 通过 `internal/app/methods_redis.go` 和专用前端视图实现，不依赖 SQL `Database` 抽象
- AI 与日志能力底座：`frontend/src/components/AIChatPanel.tsx`、`frontend/src/components/QueryEditor.tsx`、`frontend/src/components/LogPanel.tsx`

因此，GoNavi 有条件扩展出 JVM 运行时连接与受控编辑能力，但不能简单把该需求理解为“新数据库驱动”。

## 2. 目标

- 为 GoNavi 增加统一的 `JVM Connector` 子系统，用于连接和浏览 Java 服务的运行时缓存/管理对象
- 在同一套 UI 下支持多种接入模式，并根据目标 JVM 能力自动协商或手动切换
- 提供结构化的缓存浏览、值检查、受控修改、操作预览和审计记录
- 允许 AI 参与解释、分析和生成修改计划，但不默认开放 AI 自动执行
- 尽量避免强依赖 `-javaagent` 或运行时动态 attach，适配企业内对生产进程注入普遍敏感的环境

## 3. 非目标

- 不承诺“任意 JVM 内任意对象均可直接读写”
- 不在首期支持任意 Java 表达式执行、任意反射路径写值或任意 classloader 深度探测
- 不把 JVM 功能强行塞进现有 SQL `Database` / driver-agent 抽象
- 不承诺通过 Agent 模式支持所有缓存框架或任意深层对象写入
- 不绕过目标服务现有认证、鉴权和网络边界

## 4. 需求与约束

### 4.1 需求清单

- 统一配置 JVM 连接
- 探测当前 JVM 支持的接入模式与可用能力
- 浏览缓存空间、管理对象和受控操作
- 查看值快照与元数据
- 执行受控修改，并提供 before/after 预览
- 将操作结果写入审计记录
- 支持 AI 对资源结构和修改方案进行分析

### 4.2 已确认约束

- 用户倾向通用型产品形态，但目标 Java 服务大概率不允许 `-javaagent` 或运行时动态 attach
- 企业环境下，稳定性与安全性优先级高于“黑科技式通用能力”
- 一期应优先基于标准协议和业务可控接入面，而不是侵入式 runtime 操作

## 5. 现状分析

### 5.1 GoNavi 架构启示

- `internal/db/database.go` 面向标准化数据源 CRUD，适合 SQL 类资源
- `internal/app/methods_redis.go` 证明 GoNavi 已支持“独立运行时系统能力线”
- `frontend/src/components/RedisViewer.tsx` 与 `frontend/src/components/RedisCommandEditor.tsx` 提供了树形浏览、结构化值编辑和控制台交互样板
- `frontend/src/components/AIChatPanel.tsx` 与 `frontend/src/components/ai/AIMessageBubble.tsx` 已具备 AI 交互和危险执行确认能力

### 5.2 结论

JVM 缓存可视化编辑应当比照 Redis 独立建模，新增 `JVM Connector` 子系统，而不是复用 SQL `Database` 接口。

## 6. 方案比较

### 方案 A：单一路径通用 Agent

- 描述：统一要求目标 JVM 通过 `-javaagent` 或运行时 attach 暴露运行时对象访问能力
- 优点：
  - 理论能力上限最高
  - 可覆盖更多自研缓存和深层对象
- 缺点：
  - 与已知企业约束直接冲突
  - 风险最高，部署与安全成本高
  - 与首期产品化目标不匹配

### 方案 B：多接入模式 + 能力协商

- 描述：统一做 `JVM Connector`，底层同时支持 `JMX`、`Management Endpoint`、`Agent`
- 优点：
  - 产品形态统一
  - 能根据目标 JVM 能力降级
  - 可先做低风险路径，后续再扩展高级模式
- 缺点：
  - 不同模式能力不一致，UI 与权限模型更复杂

### 方案 C：只做业务侧管理端点

- 描述：完全放弃通用接入，只提供官方 Starter/管理端点接入
- 优点：
  - 结构最稳，AI 最容易接入
  - 权限、审计、预览、回滚最好做
- 缺点：
  - 不满足“尽量通用”的产品定位
  - 无法覆盖仅开放 JMX 的存量系统

## 7. 选型

采用方案 B。当前已落地：

- `JMX Provider`
- `Management Endpoint Provider`
- `Agent Provider`（高级可选模式，要求目标 Java 服务显式预埋 GoNavi Java Agent）

## 8. 目标架构

### 8.1 总体结构

新增统一的 `JVM Connector` 子系统，分为五层：

- `Connection Layer`
  - 新增 `jvm` 连接类型
  - 保存目标地址、认证、允许模式、首选模式、环境标签等配置
- `Capability Layer`
  - 建立连接后探测当前支持的 provider 与能力矩阵
- `Provider Layer`
  - `JMX Provider`
  - `Management Endpoint Provider`
  - `Agent Provider`（预留）
- `Resource Layer`
  - 将不同来源统一映射为结构化资源
- `Guard Layer`
  - 统一负责预览、确认、审计、回读验证、错误归一化

### 8.2 设计原则

- UI 统一，协议多态
- 读写分离，修改必须经过 Guard Layer
- provider 不得自行绕过权限与审计链路
- 能力不足时显式降级，不提供“看似可用、实际不可执行”的假入口

## 9. Provider 设计

### 9.1 JMX Provider

- 负责：
  - 建立 JMX/RMI 连接
  - 发现 MBean
  - 读取属性
  - 调用白名单操作
  - 写入允许修改的白名单属性
- 适用场景：
  - 目标 JVM 已开放 JMX
  - 缓存或管理对象已暴露为 MBean
- 特点：
  - 低侵入、标准化、可落地
  - key/value 级资源能力通常有限

### 9.2 Management Endpoint Provider

- 负责：
  - 调用业务服务暴露的 GoNavi 管理端点或 Starter
  - 返回结构化缓存资源、元数据和受控动作
  - 提供修改预览与回滚信息
- 适用场景：
  - 业务方愿意接入轻量 Starter/管理端点
  - 需要更强的 key/value 级浏览与修改能力
- 特点：
  - 最适合产品化和 AI 协同
  - 权限、脱敏、审计、回滚最容易做

### 9.3 Agent Provider

- 负责：
  - 在特定环境下通过 GoNavi Java Agent 暴露受控管理端口
  - 提供比 JMX 更贴近缓存资源模型的结构化浏览、预览与写入能力
- 定位：
  - 高级模式
  - 不默认启用
  - 需要目标 Java 服务以 `-javaagent` 方式显式启动

## 10. 统一资源模型

建议统一抽象以下资源：

- `runtime`
  - 目标 JVM 实例
- `cacheNamespace`
  - 缓存空间，如某个 CacheManager 下的 cacheName
- `cacheEntry`
  - 具体缓存项 key/value
- `managedBean`
  - 可读写的托管对象或 MBean
- `operation`
  - 受控操作，如 `evict`、`put`、`refresh`、`clear`
- `auditRecord`
  - 每次读写与 AI 建议的审计记录

统一资源模型要求：

- 每个资源都有稳定 ID、显示名、provider 来源、能力标签、敏感级别
- 值快照必须区分原始值、展示值和可编辑值
- 资源定位信息必须可写入审计

## 11. AI 协同设计

### 11.1 AI 的角色

AI 在 JVM 场景中只能作为“受控编排者”，不能作为直接执行者。

AI 可以：

- 解释缓存/Bean 的结构和当前状态
- 生成筛选条件和定位建议
- 生成结构化修改计划
- 生成风险说明和回滚建议
- 对执行前后结果做对比分析

AI 不应默认做：

- 直接执行 JVM 修改
- 自由生成任意脚本并直写内存
- 绕过人工确认直接调用 provider

### 11.2 AI 输出形态

AI 不直接输出脚本，而输出结构化变更计划，例如：

```json
{
  "targetType": "cacheEntry",
  "selector": {
    "namespace": "userSessionCache",
    "key": "user:1001"
  },
  "action": "updateValue",
  "payload": {
    "format": "json",
    "value": {
      "status": "ACTIVE"
    }
  },
  "reason": "修复错误缓存态"
}
```

### 11.3 AI 执行链路

1. AI 读取结构化上下文
2. AI 产出结构化变更计划
3. Guard Layer 校验目标资源、能力和权限
4. UI 展示修改预览与风险提示
5. 用户确认
6. provider 执行
7. 系统回读验证并写审计

### 11.4 一期 AI 边界

- 支持 AI 分析资源
- 支持 AI 生成修改计划
- 不默认支持 AI 自动执行修改

## 12. 页面与交互设计

### 12.1 连接层

在 `ConnectionModal` 中新增 `JVM` 类型，建议配置：

- 连接名称
- 目标地址/端口
- 认证信息
- 允许模式列表
- 首选模式
- 环境标签（DEV/UAT/PROD）
- 默认权限级别（只读/读写）

### 12.2 侧边栏

展示结构：

- 连接
- 模式能力
- 资源类型
- `cacheNamespace` / `managedBean` / `operation`

每个连接或节点显示能力徽标，例如：

- `JMX`
- `Endpoint`
- `Agent`
- `只读`
- `可写`

### 12.3 主工作区 Tab

建议新增以下 Tab 类型：

- `概览`
- `资源浏览`
- `值检查器`
- `修改预览`
- `AI 助手`
- `审计记录`

### 12.4 标准操作流

1. 用户连接 JVM
2. 系统探测 provider 能力
3. 用户选择资源并读取快照
4. 用户手工修改或让 AI 生成计划
5. 系统生成 before/after 预览
6. 用户二次确认
7. provider 执行
8. 系统回读验证
9. 写入审计与操作日志

## 13. 权限与审计

### 13.1 权限模型

权限建议分四层：

- `连接级`
  - 决定默认 `readonly` / `readwrite`
- `模式级`
  - 决定某 provider 支持哪些动作
- `资源级`
  - 某些资源永远只读
- `环境级`
  - `PROD` 默认强制二次确认，禁用 AI 自动执行

### 13.2 审计要求

JVM 审计日志不应复用 SQL 日志数据结构，但可以复用现有 LogPanel 样式。

建议记录：

- 连接 ID / 名称
- provider 类型
- 资源定位信息
- 动作类型
- 修改原因
- AI 是否参与
- 执行前摘要
- 执行后摘要
- 结果状态
- 耗时
- 错误信息

建议本地独立落盘为 `jvm_audit.jsonl` 或等价结构，不混入 `sqlLogs`。

## 14. 错误处理与兼容性边界

### 14.1 错误分层

- `连接层失败`
  - 认证失败、证书失败、JMX/RMI 不通、端点 401/403
- `能力层失败`
  - 连接成功但不支持列 key、写值或批量操作
- `执行层失败`
  - 资源不存在、值格式非法、provider 拒绝写入
- `验证层失败`
  - 执行返回成功但回读校验不一致

所有错误都应显式标明是哪个 provider、哪一层失败，避免泛化为“修改失败”。

### 14.2 首期兼容性承诺

优先承诺以下边界：

- Java 8 / 11 / 17 / 21
- Spring Boot 服务优先
- JMX 标准 MBean
- Management Endpoint 模式下优先支持：
  - Caffeine
  - Ehcache
  - Guava Cache
  - Spring Cache 抽象下可枚举缓存
  - 接入 GoNavi Starter 的自研缓存
- 值类型首期优先：
  - string
  - number
  - boolean
  - JSON object / JSON array
  - map / list 的结构化展示

### 14.3 首期不承诺

- 任意 Java 对象深度反射编辑
- 无类型信息的二进制对象直接改写
- 跨 classloader 任意对象定位
- 生产环境默认开放批量危险写入

## 15. MVP 分期

### Phase 1：连接与只读探测

- JVM 连接类型
- JMX / Endpoint 能力探测
- 资源树浏览
- 值查看
- 概览页与能力徽标
- 不开放写入

### Phase 2：受控修改与审计

- 白名单资源写入
- before/after 预览
- 二次确认
- 审计日志
- 回读验证
- 环境级保护策略

### Phase 3：AI 协同

- AI 解释资源
- AI 生成修改计划
- AI 风险分析
- AI 回滚建议
- 仍默认不允许 AI 自动执行

### Phase 4：高级模式

- Agent Provider
- 预埋 Java Agent 的 runtime 资源治理能力
- 仅在特殊环境启用

## 16. 验证策略

### 16.1 功能验证

- 能连接 JMX 目标
- 能连接 Endpoint 目标
- 能列出缓存空间
- 能查看 key/value
- 能完成受控修改并回读成功

### 16.2 兼容性验证

- Java 8 / 11 / 17 / 21
- 本地、容器、K8s 内网场景
- 开启认证 / 不开启认证
- 仅 JMX、仅 Endpoint、双模式并存

### 16.3 安全验证

- 只读连接无法写入
- `PROD` 环境必须二次确认
- AI 无法绕过人工确认直接执行
- 审计日志完整记录修改链路

### 16.4 稳定性验证

- 目标 JVM 不可达时 UI 不假死
- 资源树大数量时支持分页或懒加载
- 回读失败时标识“不确定状态”
- provider 超时、部分失败、降级路径清晰

## 17. 风险与缓解

### 17.1 风险

- 多 provider 模式会带来能力不一致，用户可能误解“所有 JVM 都能随便改”
- JMX 模式的 key/value 级能力可能明显不足
- 管理端点模式需要业务接入，推广成本高于纯客户端方案
- 若未来引入 Agent 模式，可能引入新的安全审核和兼容性成本

### 17.2 缓解

- 在 UI 中显式展示能力矩阵和当前 provider 来源
- 所有修改都强制经过预览、确认与审计
- 首期将“通用”定义为“统一入口 + 多模式协商”，而不是“单通道万能能力”
- Agent 仅作为高级扩展位，避免污染 MVP 边界

## 18. 最终结论

JVM 缓存可视化编辑能力在 GoNavi 中具备落地基础，但必须采用“统一入口、多 provider、能力协商、强 Guard Layer”的产品化方案。

推荐结论如下：

- 新增独立的 `JVM Connector` 子系统
- 首期支持 `JMX + Management Endpoint`
- `Agent` 作为高级可选模式交付
- AI 首期支持分析与生成修改计划，不默认开放自动执行
- 所有修改必须经过预览、确认、审计和回读验证

这一路径能够在兼顾企业安全约束的前提下，为用户提供可持续演进的 JVM 运行时缓存治理能力。
