# 2026-04-11 Issue Backlog Tracking

## Scope

- 分支：`codex/issue-242-data-root`
- 策略：按 GitHub issue 创建时间从早到晚逐条处理
- 提交要求：每条 issue 单独本地提交，提交信息使用 `Fixes #<issue>`

## Progress

| Issue | Title | Status | Commit |
| --- | --- | --- | --- |
| #242 | 希望有自定义数据存储位置功能 | Fixed | `1f617f9` |
| #287 | 建议补充 Sql Server 数据库图标 | Fixed | `60b63d7` |
| #305 | 金仓数据库设计表新增字段保存失败 | Fixed | `f696f52` |
| #306 | 驱动下载 | Fixed | `8297829` |
| #308 | clickhouse 获取数据库列表失败 | Fixed | `5d86ee7` |
| #310 | 选择库后，右侧行显示各个表 | Fixed | `808c773` |
| #311 | WIN 系统的执行 500 多条 insert 语句要几分钟 | Fixed | `83fe3d4` |
| #315 | 窗体内缩放异常 | Fixed | `5038ae5` |
| #316 | 人大金仓数据库驱动版本过低 | Fixed | `aa1bb5b` |
| #317 | 驱动管理增加导入 jar 功能 | Blocked | - |
| #318 | mysql,bit 列，修改成 1 失败 | Fixed | `89d79ff` |
| #319 | 关于运行外部 sql 文件的一些建议 | Deferred | - |
| #320 | 无法连接达梦数据库 | Fixed | `1c2377b` |
| #322 | 【拖选复制】希望添加 查询结果表格可以拖选复制，效果就如操作excel表格的选择复制一样 | Fixed | Pending |
| #325 | 有没有考虑对数据库的驱动版本进行选择或者自定义？ | Fixed | `af5e842` |
| #327 | SHOW DATABASES 报错 | Fixed | `fb500ee` |
| #328 | [Bug] 安装更新失败 | Fixed | `426ef3b` |
| #329 | 如果调整了左侧导航栏的宽度后，建议左侧导航栏内增加横向滚动查看 | Fixed | `fcade0f` |
| #330 | 建议在查询结果表格中增加自适应内容列宽的功能 | Fixed | `632e57e` |
| #331 | 重复连接 DB，一分钟重试了 60 多次 | Fixed | `ca76440` |
| #333 | AI 功能添加供应商测试正常，但问答显示失败 | Fixed | Pending |
| #337 | 自动更新无效 | Fixed | Pending |
| #338 | 连接clickhouse不能通过8132端口 | Fixed | Pending |
| #342 | 数据同步功能不能用，mysql数据库8.4版本选了结构同步，最后没同步成功 | Fixed | Pending |
| #343 | redis删除hash类型中的key报错 | Fixed | Pending |
| #346 | TDEngine只显示子表不显示超级表 | Fixed | Pending |
| #348 | [Bug] sql查询同名字段，结果集不会自动添加别名 | Fixed | Pending |
| #351 | 为什么没有截断和清空表的功能呀？ | Fixed | Pending |

## Notes

### #317

- 当前驱动管理只支持内置 Go 驱动和可选 Go 驱动代理包。
- 仓库内不存在 JDBC/JAR 装载、Java 运行时探测、classpath 管理或桥接执行链路。
- 在现有架构下直接增加 “导入 jar” 入口会形成假功能，因此暂记为架构阻塞，不做伪实现。

### #318

- 根因：MySQL 写入归一化只覆盖时间列，`bit` 列提交时会把前端传来的 `"1"`/`"0"` 原样透传给驱动。
- 处理：为 MySQL `bit` 列补充写入值归一化，将常见文本/布尔/数值输入转换为驱动可接受的 `[]byte`。
- 验证：补充 `internal/db/mysql_value_test.go` 回归测试，覆盖 `bit(1)` 的 insert/update 写入路径。

### #319

- 现有应用已支持“运行外部 SQL 文件”，但 issue 诉求包含目录树、目录加载、双击文件打开等整组工作区能力。
- 该项已超出单点缺陷修复范围，暂按功能增强项顺延，避免在逐条修 bug 流程中引入大范围 UI/状态管理重构。

### #320

- 达梦当前走可选 Go 驱动代理安装链路，不支持 JAR 导入属于既有架构边界。
- 根因：驱动 release 资产缓存把 `GoNavi-DriverAgents.zip` 里的 bundle 条目也混进了“顶层已发布 asset”集合，导致安装链路误以为存在单独的 `dameng-driver-agent-*.exe` 下载地址。
- 处理：缓存层区分真实 release 顶层 asset 与 bundle index 条目，安装 URL 解析仅在真实顶层 asset 存在时才走直链；bundle-only 驱动改为直接进入总包提取回退，不再先卡在 20% 试无效 URL。
- 验证：补充 `internal/app/methods_driver_version_test.go` 回归测试，覆盖 bundle-only 达梦驱动跳过伪直链，并回归 Mongo 历史版本与本地导入链路。

### #327

- 根因：低权限 MySQL 账号执行 `SHOW DATABASES` 会直接报错，当前实现没有回退路径。
- 处理：为数据库列表查询增加 `SELECT DATABASE()` 回退，仅保留当前连接库时也能正常展示。
- 验证：补充 `internal/db/mysql_metadata_test.go` 回归测试，覆盖有权限、多库和低权限回退场景。

### #328

- 根因：Windows 更新脚本在批处理执行、错误码读取和重启命令上不够稳，`cmd /C start`、LF 行尾和块内 `%ERRORLEVEL%` 在实际环境下容易引发安装失败。
- 处理：更新脚本统一输出为 CRLF，块内错误码改为延迟展开，旧文件回退路径统一为 `TARGET_OLD`，并将脚本启动方式收敛为 `cmd.exe /D /C call <script>`。
- 验证：补充 `internal/app/methods_update_windows_script_test.go`，覆盖批处理语法、Win10 回退路径、CRLF 行尾、延迟展开和启动命令构造。

### #325

- 根因：TDengine 的版本列表虽然支持下拉选择，但后端在抓取与缓存 Go 模块版本时只保留最近 5 个版本，导致 `3.5.x / 3.3.x / 3.0.x` 这类旧版根本不会进入选择列表。
- 处理：放宽 TDengine 的历史版本窗口，并补充离线 fallback 版本矩阵；同时扩大模块版本缓存上限，确保旧版不会在抓取阶段就被截断。
- 验证：补充 `internal/app/methods_driver_version_test.go` 回归测试，覆盖缓存命中与 fallback 两条路径，并回归 Mongo 版本约束逻辑。

### #329

- 根因：侧边栏连接树被全局 Tree 样式固定为 `width: 100%`，标题同时启用了省略截断，导致缩窄侧栏后长节点无法形成横向溢出。
- 处理：为 Sidebar 树增加专用横向滚动容器，并在 Sidebar 作用域内覆写 Tree 宽度与标题截断规则，让节点宽度随内容扩展且保留最小占满。
- 验证：执行 `frontend` 下 `npm run build`，确认 TS/CSS 改动编译通过且仅作用于 Sidebar 树。

### #331

- 根因：连接失败时存在双层重试叠加。`DBGetDatabases / DBGetTables / DBQuery` 在缓存失效后本来就会主动重建连接一次，而 `connectDatabaseWithStartupRetry` 在稳定期仍会额外放行一次瞬时错误自动重试，导致一次后台探测会被放大成多次真实建连。
- 处理：将连接自动重试范围收敛到应用启动保护窗口内；稳定期下所有连接探测与重建都只执行一次，避免后台挂起场景持续放大失败流量。
- 验证：补充并更新 `internal/app/app_startup_connect_retry_test.go`，覆盖稳定期瞬时失败不重试、不再输出重试提示，以及启动期仍保留完整重试预算。

### #333

- 根因：AI 供应商“测试连接”走的是轻量健康检查，不会带 `tools`；而正式聊天默认会把本地工具定义一起发给模型。当前 `Anthropic` 协议路径缺少和 `OpenAI` 一样的 400 自动降级逻辑，遇到不支持工具调用的兼容端点时会直接报错。
- 处理：为 `AnthropicProvider.Chat / ChatStream` 补充 400 降级回退。首次带 `tools` 请求若返回 400/422/404，则自动去掉 `tools` 重试一次，允许不支持 function calling 的兼容端点继续完成普通问答。
- 验证：补充 `internal/ai/provider/anthropic_test.go` 回归测试，覆盖非流式与流式两条链路下“首请求因 tools 返回 400，回退后成功”的场景，并执行 `go test ./internal/ai/provider -count=1`。

### #337

- 根因：Linux 自动更新链路有两个断点。其一，更新资产名只按 `linux/amd64` 固定选择 `GoNavi-<ver>-Linux-Amd64.tar.gz`，没有根据当前运行的是 `WebKit41` 变体去选 `-WebKit41` 包；其二，Linux 安装脚本解压后优先查找固定文件名 `GoNavi`，而 release tar.gz 实际打包的是构建产物名，导致替换阶段经常找不到新二进制。
- 处理：为更新资产解析新增“基于当前可执行文件路径推断 Linux 变体”的后缀选择逻辑；同时调整 Linux 更新脚本，解压后优先搜索与当前运行二进制同名的文件，再回退查找 `GoNavi`。
- 验证：补充 `internal/app/methods_update_test.go` 回归测试，覆盖 Linux `WebKit41` 资产名选择与更新脚本目标名解析，并执行 `go test ./internal/app -run 'Test(ExpectedAssetNameForExecutableUsesLinuxWebKit41Suffix|BuildLinuxScriptPrefersTargetExecutableBasename|TestFetchLatestUpdateInfo|TestCheckForUpdates|TestBuildWindowsScript)' -count=1`。

### #338

- 根因：ClickHouse 连接协议识别只把 `8123/8443` 视为 HTTP 端口，`8132` 会被误判为 native，导致连接阶段优先走错协议。
- 处理：将 `8132` 纳入 ClickHouse HTTP 端口识别，并同步更新自动切换日志和错误提示中的端口说明，避免排障信息继续误导。
- 验证：补充 `internal/db/clickhouse_impl_test.go` 回归测试，覆盖 `8132`、`8123`、`8443` 的 HTTP 判定以及 `9000/9440` 的 native 判定，并执行 `go test -tags gonavi_clickhouse_driver ./internal/db -run 'TestClickHouse(PingValidatesQueryPath|GetDatabasesFallsBackToCurrentDatabase|DetectClickHouseProtocolTreatsHTTPPortsAsHTTP)' -count=1`。

### #342

- 根因：结构同步现有执行链路统一依赖 `buildSchemaMigrationPlan(...).PreDataSQL`。但 legacy planner 在“目标表已存在”分支里只给 `MySQL -> Kingbase` 生成补字段 SQL，`MySQL -> MySQL` 即使目标表缺列也只记 warning，不会产生任何可执行结构变更；同时前端 schema 模式的预览入口完全按数据差异计数启用，导致结构同步场景无法点开预览。
- 处理：将 existing-target 分支的自动补字段逻辑改为复用通用 `buildAddColumnSQLForPair`，让 `MySQL -> MySQL` 也能生成并执行缺失字段补齐 SQL；同时为 analyze/preview 响应补充 `schemaDiffCount`、`schemaStatements`、`schemaSummary` 和 warning 信息，前端 schema 模式下可直接查看结构变更语句与风险提示，SQL 预览也会包含结构语句。
- 验证：新增 `internal/sync/schema_migration_test.go` 回归测试，覆盖 `MySQL -> MySQL` 已存在目标表时生成补字段 SQL，并执行 `go test ./internal/sync -count=1` 与 `frontend` 下 `npm run build`。

### #343

- 根因：前端 Redis hash 字段删除调用把单个字段 `string` 直接传给 `RedisDeleteHashField`，而后端/Wails 绑定签名要求的是 `[]string`，导致在参数反序列化阶段直接报 `json: cannot unmarshal string into Go value of type []string`。
- 处理：前端改为传单元素数组；后端再增加一层参数归一化，兼容单字符串、字符串数组和 `[]interface{}` 三种形态，避免旧调用或异常入参再次在绑定层直接失败。
- 验证：新增 `internal/app/methods_redis_test.go` 回归测试，覆盖单字符串与字符串数组两种调用形态，并执行 `go test ./internal/app -count=1` 与 `frontend` 下 `npm run build`。

### #346

- 根因：`TDengineDB.GetTables` 只查询 `SHOW TABLES`，没有把 `SHOW STABLES` 的超级表结果并入返回列表，导致 Sidebar 和依赖表列表的导出链路都只能看到子表。
- 处理：为 TDEngine 表列表查询补充 `SHOW STABLES`，与 `SHOW TABLES` 结果统一去重合并后返回，保证普通表和超级表同时可见。
- 验证：新增 `internal/db/tdengine_applychanges_test.go` 回归测试，覆盖 `GetTables` 返回普通表 + 超级表，并执行 `go test -tags gonavi_tdengine_driver ./internal/db -count=1`。

### #348

- 根因：查询结果扫描层直接使用数据库返回的原始列名作为 `map[string]interface{}` 键。同名列场景下，后面的值会覆盖前面的值，返回给前端的 `fields/columns` 也保留重复列名，导致结果集既无法自动补别名，也拿不到两列值。
- 处理：为 `scanRows` 增加稳定列名归一化逻辑。首次出现保留原名，重复列自动追加 `_2`、`_3` 后缀；空列名回退为 `column_N`。返回的列列表和每行数据统一使用同一套唯一列名，避免覆盖。
- 验证：新增 `internal/db/scan_rows_test.go` 回归测试，覆盖重复列 `id/id/name` 自动归一化为 `id/id_2/name` 且两列值均保留，并执行 `go test ./internal/db -run TestScanRowsRenamesDuplicateColumns -count=1` 与 `go test ./internal/db -count=1`。

### #330

- 根因：查询结果表格已经支持拖拽调整列宽，但 resize handle 没有提供双击自适应逻辑，导致用户只能靠手工拖拽慢慢试宽度。
- 处理：为 `DataGrid` 的列宽拖拽手柄增加双击入口，按当前表头与已加载结果集内容估算目标宽度，并直接复用现有 `columnWidths` 状态更新布局。
- 验证：新增 `frontend/src/components/dataGridAutoWidth.test.ts` 覆盖列宽估算规则，并执行 `frontend` 下 `npm run build` 确认 TS 与打包通过。

### #322

- 根因：`DataGrid` 已经具备拖选单元格和选区状态维护能力，但当前复制能力只支持把同一行选中的列值暂存为内部 patch，用于“粘贴到选中行”，没有把矩形选区真正导出到系统剪贴板。
- 处理：新增选区复制 helper，将矩形选区按当前可见行列顺序导出为制表符文本；同时补上工具栏“复制选区”按钮和 `Ctrl/Cmd+C` 快捷键，让拖选后的复制行为更接近 Excel。
- 验证：新增 `frontend/src/components/dataGridSelectionCopy.test.ts` 覆盖选区排序与剪贴板文本规整规则，并执行 `frontend` 下 `npm run build` 确认功能接线通过。

### #351

- 根因：后端已有批量清空表能力，但前端单表危险操作菜单只暴露了“删除表”，没有把“截断表 / 清空表”作为显式入口提供给用户；同时批量“清空”动作底层语义也混用了 `TRUNCATE/DELETE`。
- 处理：后端将“截断表”和“清空表”拆分为显式能力，统一通过 helper 生成多数据库 SQL；前端为 Sidebar 和 TableOverview 的表菜单补上两个危险操作入口，并仅在明确支持 `TRUNCATE TABLE` 的数据库类型上显示“截断表”。
- 验证：新增 `internal/app/methods_file_clear_test.go` 与 `frontend/src/components/tableDataDangerActions.test.ts`，并执行 `go test ./...`、`frontend` 下 `npm run build` 确认全量通过。

## Next

- 继续处理下一个最早且可直接落地的开放 issue。
