# 2026-04-11 Issue Backlog Tracking

## Scope

- 分支：`codex/issue-242-data-root`
- 策略：按 GitHub issue 创建时间从早到晚逐条处理
- 提交要求：每条 issue 单独本地提交，提交信息使用 `Fixes #<issue>`

## Progress

| Issue | Title | Status | Commit |
| --- | --- | --- | --- |
| #242 | 希望有自定义数据存储位置功能 | Fixed | `42c5500` |
| #287 | 建议补充 Sql Server 数据库图标 | Fixed | `ebae05c` |
| #305 | 金仓数据库设计表新增字段保存失败 | Fixed | `9ecf5be` |
| #306 | 驱动下载 | Fixed | `c49ed95` |
| #308 | clickhouse 获取数据库列表失败 | Fixed | `33bbd91` |
| #310 | 选择库后，右侧行显示各个表 | Fixed | `5bbeba2` |
| #311 | WIN 系统的执行 500 多条 insert 语句要几分钟 | Fixed | `fd7ec11` |
| #315 | 窗体内缩放异常 | Fixed | `e19dd82` |
| #316 | 人大金仓数据库驱动版本过低 | Fixed | `2500183` |
| #317 | 驱动管理增加导入 jar 功能 | Blocked | - |
| #318 | mysql,bit 列，修改成 1 失败 | Fixed | `bee78be` |
| #319 | 关于运行外部 sql 文件的一些建议 | Deferred | - |
| #320 | 无法连接达梦数据库 | Fixed | Pending |
| #327 | SHOW DATABASES 报错 | Fixed | `5ac0221` |
| #328 | [Bug] 安装更新失败 | Fixed | `436f130` |

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

## Next

- 继续处理下一个最早且可直接落地的开放 issue。
