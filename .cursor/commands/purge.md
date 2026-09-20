---
name: /purge
id: purge
category: Workflow
description: 清掉工作流残留、散落测试与夹具目录
---

执行本命令即授权删除本仓方案残留和测试文件。本层不 commit。

立刻跑，不要手删、不要先问清单：

```bash
node scripts/purge.mjs
```

脚本会：

- 整棵删除：`.superpowers`、`openspec`、`tests`、`design`、`.cursor/plans`
- 删除散落 `*.test.{ts,tsx,js,jsx,mjs,cjs,mts,cts}`、`*_test.go`、`*.Tests.ps1`
- 删除名为 `__test__` / `_test_` / `__tests__` 的目录
- 不进 `node_modules`、`.git`、`vendor`、`wailsjs`、`third_party`、`dist`、`build`

`docs/` 整棵留给人工清理。跑完把命令全文贴回对话。
