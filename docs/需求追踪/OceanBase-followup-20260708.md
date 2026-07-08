# OceanBase 用户反馈后续修复跟踪

## 本 PR 已处理

- 查询编辑器最大返回行数增加 100 选项，便于快速小结果集验证。
- OceanBase Oracle 协议下，Ctrl/Cmd 点击多段对象名时，取最后两段作为 `schema.table` 打开表结构，兼容 `tenant.schema.table` / `catalog.owner.table` 这类完整限定写法。

## 后续待处理

- 查询编辑器偶发丢键，需要继续定位 Monaco / 全局快捷键 / IME 组合问题。
- 查询结果分页摘要需要区分“达到查询上限”和“总数未统计”。
- 查询效率继续优化，需要增加耗时阶段日志和 OceanBase Oracle 专项链路分析。
- 同义词与真实表的隐藏字段规则需要做统一 key 归一化。
- 查询序列报错需要结合具体入口和 SQL 样例确认是序列元数据、DDL 查看还是 NEXTVAL 查询路径。
