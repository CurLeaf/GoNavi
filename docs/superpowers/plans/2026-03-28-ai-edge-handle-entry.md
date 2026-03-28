# AI Edge Handle Entry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 助手入口从标题栏移除，改为主内容区右侧的 `A2` 贴边标签入口，并保持现有 AI 面板开关与聊天逻辑不变。

**Architecture:** 保留现有 `App.tsx` 作为 AI 入口装配点，不改 AI 面板展开方向和 store 状态。通过 `aiEntryLayout.ts` 承载可测试的布局/样式决策，让 `App.tsx` 只负责在“主内容关闭态”和“面板展开态”两个壳层里挂载同一个贴边标签。

**Tech Stack:** React 18, TypeScript, Ant Design, Vitest, Vite

---

## File Map

- Modify: `frontend/src/App.tsx`
  - 移除标题栏 AI 入口渲染与相关样式状态
  - 在主内容区右边缘挂载关闭态入口
  - 在 AI 面板外沿挂载打开态入口
- Modify: `frontend/src/utils/aiEntryLayout.ts`
  - 将现有标题栏专用布局 helper 改为右侧贴边标签 helper
  - 保留 `SIDEBAR_UTILITY_ITEM_KEYS`
- Modify: `frontend/src/utils/aiEntryLayout.test.ts`
  - 先写失败测试，锁定入口位置、附着位置和贴边标签样式约束
- Modify: `docs/需求追踪/需求进度追踪-AI助手入口迁移到应用顶栏右侧-20260328.md`
  - 同步“设计已切换到右侧贴边标签方案”和后续验证状态

## Chunk 1: Layout Contract Regression

### Task 1: 把布局辅助契约改成“右侧贴边标签”

**Files:**
- Modify: `frontend/src/utils/aiEntryLayout.test.ts`
- Modify: `frontend/src/utils/aiEntryLayout.ts`

- [ ] **Step 1: 写失败测试，锁定新的布局语义**
- [ ] **Step 2: 运行测试，确认它因旧契约而失败**
- [ ] **Step 3: 用最小改动实现新的 helper 契约**
- [ ] **Step 4: 重新运行测试，确认 helper 契约变绿**
- [ ] **Step 5: 提交这一小块**

## Chunk 2: Remove Titlebar Entry

### Task 2: 从标题栏彻底移除 AI 入口

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 写出本次要删除的标题栏入口代码清单**
- [ ] **Step 2: 删除标题栏 AI 入口相关状态与 JSX**
- [ ] **Step 3: 运行前端构建，确认清理后没有遗留引用**
- [ ] **Step 4: 提交标题栏清理**

## Chunk 3: Mount The Edge Handle

### Task 3: 在主内容区右边缘挂载关闭态贴边标签

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/utils/aiEntryLayout.ts`

- [ ] **Step 1: 为关闭态入口写最小布局决策代码**
- [ ] **Step 2: 把主内容横向容器改成可承载绝对定位标签**
- [ ] **Step 3: 运行构建，确认关闭态入口接入不破坏布局**
- [ ] **Step 4: 提交关闭态入口挂载**

### Task 4: 打开 AI 面板时让标签贴住面板外沿

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 给 AI 面板外层加一个仅负责贴边标签定位的壳层**
- [ ] **Step 2: 用附着位置决策保证开关态只渲染一个入口**
- [ ] **Step 3: 重新运行 helper 测试和构建**
- [ ] **Step 4: 提交打开态连续关系**

## Chunk 4: Manual Verification And Docs

### Task 5: 手工验证空间关系，再更新追踪文档

**Files:**
- Modify: `docs/需求追踪/需求进度追踪-AI助手入口迁移到应用顶栏右侧-20260328.md`

- [ ] **Step 1: 启动本地开发环境做手工验证**
- [ ] **Step 2: 如发现重叠，优先调整偏移而不是改回胶囊按钮**
- [ ] **Step 3: 运行最终验证命令**
- [ ] **Step 4: 更新需求追踪文档**
- [ ] **Step 5: 提交收尾文档与验证结果**
