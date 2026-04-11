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

### #330

- 根因：查询结果表格已经支持拖拽调整列宽，但 resize handle 没有提供双击自适应逻辑，导致用户只能靠手工拖拽慢慢试宽度。
- 处理：为 `DataGrid` 的列宽拖拽手柄增加双击入口，按当前表头与已加载结果集内容估算目标宽度，并直接复用现有 `columnWidths` 状态更新布局。
- 验证：新增 `frontend/src/components/dataGridAutoWidth.test.ts` 覆盖列宽估算规则，并执行 `frontend` 下 `npm run build` 确认 TS 与打包通过。

### #322

- 根因：`DataGrid` 已经具备拖选单元格和选区状态维护能力，但当前复制能力只支持把同一行选中的列值暂存为内部 patch，用于“粘贴到选中行”，没有把矩形选区真正导出到系统剪贴板。
- 处理：新增选区复制 helper，将矩形选区按当前可见行列顺序导出为制表符文本；同时补上工具栏“复制选区”按钮和 `Ctrl/Cmd+C` 快捷键，让拖选后的复制行为更接近 Excel。
- 验证：新增 `frontend/src/components/dataGridSelectionCopy.test.ts` 覆盖选区排序与剪贴板文本规整规则，并执行 `frontend` 下 `npm run build` 确认功能接线通过。

## Next

- 继续处理下一个最早且可直接落地的开放 issue。
