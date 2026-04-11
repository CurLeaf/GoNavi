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
| #318 | mysql,bit 列，修改成 1 失败 | Fixed | Pending |

## Notes

### #317

- 当前驱动管理只支持内置 Go 驱动和可选 Go 驱动代理包。
- 仓库内不存在 JDBC/JAR 装载、Java 运行时探测、classpath 管理或桥接执行链路。
- 在现有架构下直接增加 “导入 jar” 入口会形成假功能，因此暂记为架构阻塞，不做伪实现。

### #318

- 根因：MySQL 写入归一化只覆盖时间列，`bit` 列提交时会把前端传来的 `"1"`/`"0"` 原样透传给驱动。
- 处理：为 MySQL `bit` 列补充写入值归一化，将常见文本/布尔/数值输入转换为驱动可接受的 `[]byte`。
- 验证：补充 `internal/db/mysql_value_test.go` 回归测试，覆盖 `bit(1)` 的 insert/update 写入路径。

## Next

- 继续处理下一个最早且可直接落地的开放 issue。
