# GoNavi - 现代化轻量级数据库客户端

[![Go Version](https://img.shields.io/github/go-mod/go-version/Syngnat/GoNavi)](https://go.dev/)
[![Wails Version](https://img.shields.io/badge/Wails-v2-red)](https://wails.io)
[![React Version](https://img.shields.io/badge/React-v18-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Syngnat/GoNavi/release.yml?label=Build)](https://github.com/Syngnat/GoNavi/actions)
[![Stars](https://img.shields.io/github/stars/Syngnat/GoNavi?style=social)](https://github.com/Syngnat/GoNavi/stargazers)
[![Downloads](https://img.shields.io/github/downloads/Syngnat/GoNavi/total?color=blue&label=downloads)](https://github.com/Syngnat/GoNavi/releases)

**语言**: [English](README.md) | 简体中文

GoNavi 是基于 **Wails (Go)** 与 **React** 构建的跨平台数据库管理工具，强调原生性能、低资源占用与多数据源统一工作流。

相比常见 Electron 客户端，GoNavi 在体积、启动速度和内存占用上更轻量。

---

## 项目简介

GoNavi 面向开发者与 DBA，核心目标是让数据库操作在桌面端做到“快、稳、统一”。

- **原生性能架构**：Wails（Go + WebView），降低运行时开销。
- **大数据可用性**：虚拟滚动 + DataGrid 交互优化，提升大结果集可操作性。
- **统一连接能力**：支持 URI 生成/解析、SSH 隧道、代理、驱动按需安装。
- **工程化能力完整**：覆盖 SQL 编辑、对象管理、批量导出/备份、数据同步、执行日志、在线更新。

## 支持的数据源

> `内置`：主程序开箱即用。  
> `可选驱动代理`：需在驱动管理中安装启用后可用。

| 类别 | 数据源 | 驱动模式 | 典型能力 |
|---|---|---|---|
| 关系型 | MySQL | 内置 | 库表浏览、SQL 查询、数据编辑、导出/备份 |
| 国产数据库 | GoldenDB | 内置 | MySQL 兼容查询工作流、分布式事务场景 |
| 关系型 | PostgreSQL | 内置 | 库表浏览、SQL 查询、数据编辑、对象管理 |
| 关系型 | Oracle | 内置 | 连接查询、对象浏览、数据编辑 |
| 缓存 | Redis | 内置 | Key 浏览、命令执行、编码/视图切换 |
| 向量数据库 | Chroma | 内置 | Collection 浏览、向量检索、元数据过滤 |
| 向量数据库 | Qdrant | 内置 | Collection 浏览、向量搜索、Payload 过滤 |
| 向量数据库 | Milvus | 内置 | Collection 浏览、向量搜索、标量过滤 |
| 消息队列 | RocketMQ | 内置 | Topic 浏览、消费组检查、消息型工作流 |
| 消息队列 | MQTT | 内置 | Broker / Topic Filter 工作流与 QoS 连接配置 |
| 消息队列 | Kafka | 内置 | Topic 浏览、Broker 元数据、消费组工作流 |
| 消息队列 | RabbitMQ | 内置 | Queue / Exchange 浏览、Virtual Host 检查、Management API 工作流 |
| 关系型 | MariaDB | 可选驱动代理 | 连接查询、对象管理、数据编辑 |
| 关系型 | Doris | 可选驱动代理 | 连接查询、对象浏览、SQL 执行 |
| 列式分析 | StarRocks | 可选驱动代理 | 连接查询、对象浏览、SQL 执行 |
| 搜索 | Sphinx | 可选驱动代理 | SphinxQL 查询与对象浏览 |
| 关系型 | SQL Server | 可选驱动代理 | 库表浏览、SQL 查询、对象管理 |
| 文件型 | SQLite | 可选驱动代理 | 本地文件库浏览、编辑、导出 |
| 文件型 | DuckDB | 可选驱动代理 | 大表查询、分页浏览、文件库管理 |
| 国产数据库 | OceanBase | 可选驱动代理 | MySQL / Oracle 租户接入、对象浏览、查询工作流 |
| 国产数据库 | Dameng | 可选驱动代理 | 连接查询、对象浏览、数据编辑 |
| 国产数据库 | Kingbase | 可选驱动代理 | 连接查询、对象浏览、数据编辑 |
| 国产数据库 | HighGo | 可选驱动代理 | 连接查询、对象浏览、数据编辑 |
| 国产数据库 | Vastbase | 可选驱动代理 | 连接查询、对象浏览、数据编辑 |
| 国产数据库 | OpenGauss | 可选驱动代理 | 类 PostgreSQL 的库表浏览、SQL 查询、对象管理 |
| 国产数据库 | GaussDB | 可选驱动代理 | 类 PostgreSQL 的库表浏览、SQL 查询、对象管理 |
| 多模型数据库 | InterSystems IRIS | 可选驱动代理 | Namespace 浏览、SQL 查询、对象管理 |
| 文档型 | MongoDB | 可选驱动代理 | 文档查询、集合浏览、连接管理 |
| 时序 | TDengine | 可选驱动代理 | 时序库表浏览、查询分析 |
| 时序 | Apache IoTDB | 可选驱动代理 | Storage Group / Device / Timeseries 浏览与查询 |
| 列式分析 | ClickHouse | 可选驱动代理 | 分析查询、对象浏览、SQL 执行 |
| 联邦查询 | Trino | 可选驱动代理 | 跨多数据源联邦 SQL、`catalog.schema` 浏览、SQL 执行 |
| 搜索 | Elasticsearch | 可选驱动代理 | 索引浏览、Mapping 检查、JSON DSL / query_string 查询 |
| 扩展接入 | Custom Driver/DSN | 自定义 | 通过 Driver + DSN 接入更多数据源 |

<h2 align="center">📸 项目截图</h2>

<div align="center">
    <img width="25%" alt="image" src="https://github.com/user-attachments/assets/0eefe07f-2836-44fa-9ddf-a0d2124b90e2" />
    <img width="25%" alt="image" src="https://github.com/user-attachments/assets/6765e539-83ea-4cd6-9c9e-f42790fa05b5" />
    <img width="25%" alt="image" src="https://github.com/user-attachments/assets/60e3d187-171a-4248-94e0-c6b08736e235" />
    <br />
    <img width="25%" alt="image" src="https://github.com/user-attachments/assets/7a478602-0f08-4b30-8f6a-879f4a60ae32" />
    <img width="14%" alt="image" src="https://github.com/user-attachments/assets/6442ca7d-ce9e-46d9-aecd-405ba88f5a5e" />
    <img width="25%" alt="image" src="https://github.com/user-attachments/assets/bc17895e-02a4-4cc5-b471-c3803cf25a2b" />
</div>

---

## 核心特性

### AI 智能助手 (New)
- **多模型服务商支持**：内置跨平台接入 OpenAI, Google Gemini, Anthropic Claude，同时支持任意自定义兼容 OpenAI 格式的 API。
- **关联表结构上下文**：原生支持将当前数据库表结构直接提取作为上下文发送给 AI，让 SQL 生成、分析变得更精准。
- **快捷指令**：内置多种快捷对话指（如一键生成 SQL、解释执行逻辑、分析性能优化、表字段代码评审等）。
- **内置 MCP 工作流**：可在 AI 设置里管理 MCP 服务，一键安装 GoNavi MCP 到 Claude Code / Codex，或开启 Streamable HTTP 供远端 Agent 使用。
- **远端 Agent 边界清晰**：数据库连接与密码继续保留在运行 GoNavi 的主机上，云端 Agent 通过 MCP 读取结构与上下文。
- **安全控制可追溯**：远端 `schema-only` 模式默认不暴露 `execute_sql`；如开启 SQL 执行，非只读语句仍需显式传入 `allowMutating=true`。

### 性能与交互
- 大数据场景下保持流畅交互（含 DataGrid 列宽拖拽、批量编辑流程优化）。
- 虚拟滚动渲染，降低大结果集卡顿风险。

### 数据管理（DataGrid）
- 单元格所见即所得编辑。
- 批量新增/修改/删除，支持事务提交与回滚。
- 大字段弹窗编辑。
- 右键上下文操作（NULL、复制、导出等）。
- 根据查询上下文智能切换读写模式。
- 支持 CSV / XLSX / JSON / Markdown 导出。

### SQL 编辑器
- 基于 Monaco Editor。
- 上下文补全（数据库/表/字段）。
- 多标签查询工作流。

### 连接与驱动
- URI 生成与解析。
- SSH 隧道、代理支持。
- 连接配置 JSON 导入/导出。
- 可选驱动安装与启用管理。

### Redis 工具
- 自动/原始文本/UTF-8/十六进制等视图模式。
- 内置命令执行面板。

### 可观测性与更新
- SQL 执行日志（含耗时）。
- 启动/定时/手动更新检查。

### UI 体验
- Ant Design 5 体系。
- 深色/浅色主题切换。
- 灵活布局与侧边栏行为。

---

## 技术栈

- **后端**: Go 1.24 + Wails v2
- **前端**: React 18 + TypeScript + Vite
- **UI 框架**: Ant Design 5
- **状态管理**: Zustand
- **编辑器**: Monaco Editor

---

## 安装与运行

### 前置要求
- [Go](https://go.dev/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation):
  `go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0`

### 开发模式

```shell
# 克隆项目
git clone https://github.com/Syngnat/GoNavi.git
cd GoNavi

# 启动开发（热重载）
wails dev

# 本地快速启动：未修改 Go 导出方法签名时使用
node tools/wails-fast-dev.mjs

# 修改 Go 导出方法签名后刷新 Wails JS 绑定
node tools/wails-fast-dev.mjs --refresh-bindings

# Windows 桌面端默认使用不透明 WebView，并关闭 Acrylic 背景
```

### 编译构建

```bash
# 构建当前平台
wails build

# 清理后构建（发布前推荐）
wails build -clean
```

构建产物位于 `build/bin`。

### 浏览器访问版（Web Server，实验中）

仓库主程序提供 `web-server` 运行模式，用同一套 Go 后端 + React 前端提供浏览器访问入口（**不是**桌面 Wails 窗口容器化）。

#### 本机直接启动

```powershell
go build .
.\GoNavi-Wails.exe web-server --addr 127.0.0.1:34116
```

未配置密码时，首次访问会进入 `/setup` 完成 Web 管理员密码初始化；可选启用 Google Authenticator，服务端会落地 `web_auth.json`、Session Cookie、恢复码与登录失败限流。

当前阶段已具备：

- 浏览器端 Wails bridge（`window.go.*` / `window.runtime.*` -> HTTP / SSE）
- 首次初始化页、登录页、登出接口
- Session 空闲超时 / 绝对超时 / 记住登录时长
- Google Authenticator TOTP 与恢复码
- Docker / Compose 部署入口（见下方）

当前仍在继续收口：

- 外部 SQL / 连接包导入导出等文件型能力的浏览器上传下载工作台
- 更多桌面专属能力的 Web 门禁与替代交互
- 反向代理 / HTTPS / 零信任部署说明

#### Docker / Podman（Web Server）

```bash
cp docker.web-server.env.example docker.web-server.env
# 编辑 GONAVI_HOST_DATA_ROOT 为绝对路径
# 可选设置至少 6 位的 GONAVI_WEB_PASSWORD
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d
```

也可以把相同变量写入项目目录下的标准 `.env` 文件，此时可省略 `--env-file docker.web-server.env`。

浏览器打开 `http://127.0.0.1:34116`（或宿主机映射端口）。设置 `GONAVI_WEB_PASSWORD` 后，新创建的容器会同步该密码并直接进入登录页；未设置时首次访问完成 `/setup`。

请把 GoNavi 活动数据目录挂载为 `/data`。建议至少包含 `connections.json`、`daily_secrets.json`；如需可选驱动代理应包含 `drivers/`。Web 认证状态写入同目录下的 `web_auth.json`。

`GONAVI_WEB_PASSWORD` 会覆盖 `web_auth.json` 中已有的密码哈希，但保留 2FA 和会话策略；移除环境变量后继续使用最后一次同步的密码。env 文件包含明文密码，可被有容器检查权限的用户看到，请限制文件读取权限。

修改 env 密码后，需要重新创建容器，让 Compose 重新读取 env 文件：

```bash
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d --force-recreate
```

Docker Desktop 的 Restart 和 `docker restart` 会沿用旧容器环境，不会重新读取 env 文件。

新部署直接设置环境密码时会启用纯密码认证。如需启用 2FA，请先留空 `GONAVI_WEB_PASSWORD` 并通过 `/setup` 初始化，再将它设置为同一密码后重新创建容器。

容器内默认监听 `0.0.0.0:34116`（`GONAVI_WEB_ADDR`）。**不要把未加固的 Web 入口直接暴露到公网**；生产环境请配合反向代理与 HTTPS。

默认 Compose 拉取 GHCR 预构建镜像。本地源码构建叠加 override：

```bash
docker compose --env-file docker.web-server.env \
  -f docker-compose.web-server.yml \
  -f docker-compose.web-server.local.yml \
  up -d --build
```

健康检查：`GET /__gonavi/healthz`。

### Docker / Podman（MCP Server）

容器化另提供 `gonavi-mcp-server`（仅 MCP HTTP，不含桌面 GUI / Web UI）。

```bash
cp docker.mcp-server.env.example docker.mcp-server.env
docker compose --env-file docker.mcp-server.env -f docker-compose.mcp-server.yml up -d
```

请把 GoNavi 的活动数据目录挂载进容器。该目录内至少应包含 `connections.json`、`daily_secrets.json`，如需可选驱动代理还应包含 `drivers/`。

默认 Compose 会直接拉取 GHCR 预构建镜像。如果你要用当前仓库源码本地构建，再叠加一个 override：

```bash
docker compose --env-file docker.mcp-server.env \
  -f docker-compose.mcp-server.yml \
  -f docker-compose.mcp-server.local.yml \
  up -d --build
```

如果你使用 Podman，可直接复用同一套 OCI 镜像，走 `podman run` 或 Quadlet。仓库内已经提供 [deploy/podman/gonavi-mcp-server](deploy/podman/gonavi-mcp-server) 作为 Podman 原生部署入口，适合 Linux 服务器 / NAS 的 rootless systemd 常驻服务。

部署矩阵：

- Web UI：`docker-compose.web-server.yml`（镜像 `ghcr.io/syngnat/gonavi-web-server`）
- MCP：`docker-compose.mcp-server.yml`（镜像 `ghcr.io/syngnat/gonavi-mcp-server`）
- Podman / Quadlet：[deploy/podman/gonavi-mcp-server](deploy/podman/gonavi-mcp-server)
- Kubernetes：[deploy/k8s/gonavi-mcp-server](deploy/k8s/gonavi-mcp-server)（`kustomization.yaml` + overlays）
- Helm Chart：[deploy/helm/gonavi-mcp-server](deploy/helm/gonavi-mcp-server)
- 仅构建环境：`Dockerfile.build-env`

完整部署方式与安全边界见 [cmd/gonavi-mcp-server/README.md](cmd/gonavi-mcp-server/README.md)。

### Docker / Podman（仅构建环境）

如果只是想要一套稳定的 Linux 构建环境来编译 Wails，可直接使用 `Dockerfile.build-env`：

```bash
docker build -f Dockerfile.build-env -t gonavi-build-env:local .
docker run --rm -it -v "$PWD:/workspace" -w /workspace gonavi-build-env:local bash
```

同一个 Dockerfile 也可以直接给 Podman 使用，例如 `podman build -f Dockerfile.build-env -t localhost/gonavi-build-env:local .`，然后执行 `podman run --rm -it -v "$PWD:/workspace" -w /workspace localhost/gonavi-build-env:local bash`。

这个镜像默认安装 WebKitGTK 4.0 构建依赖，兼容面更适合常见 Linux / NAS 场景。镜像底座本身支持多架构，`amd64` / `arm64` 会跟随容器平台。

仓库会把预构建镜像推送到 GHCR：

- `ghcr.io/syngnat/gonavi-web-server:latest`
- `ghcr.io/syngnat/gonavi-mcp-server:latest`
- `ghcr.io/syngnat/gonavi-build-env:latest`

这个镜像只负责构建 Linux 产物，不会把 Wails 桌面 GUI 变成可浏览器访问的 Web 服务。

### 跨平台发布（GitHub Actions）

仓库内置发布流水线，推送 `v*` Tag 可自动构建并发布 Release。
Release 更新说明会基于已合并 Pull Request 自动生成，并按 `.github/release.yaml` 分类。

支持目标：
- macOS (AMD64 / ARM64)
- Windows (AMD64)
- Linux (AMD64，含 WebKitGTK 4.0 / 4.1 变体)

---

## 常见问题

### macOS 提示“应用已损坏，无法打开”

在未进行 Apple Notarization 时，Gatekeeper 可能拦截应用。

```bash
sudo xattr -rd com.apple.quarantine /Applications/GoNavi.app
```

### Linux 缺少 `libwebkit2gtk` / `libjavascriptcoregtk`

```bash
# Debian 13 / Ubuntu 24.04+
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0

# Ubuntu 22.04 / Debian 12
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.0-37 libjavascriptcoregtk-4.0-18
```

### Linux 中文显示为方框

Ubuntu 24.04 LTS 的最小化桌面或服务器环境可能没有安装中文 CJK 字体，GoNavi 打开后中文会显示为方框。安装 Noto / 文泉驿字体后重启 GoNavi：

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk fonts-wqy-microhei
fc-cache -fv
```

---

## 贡献指南

欢迎提交 Issue 与 Pull Request。

完整流程、分支模型与维护者同步规则请查看：

- [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)

外部贡献者应从 `dev` 拉出分支，并统一向 `dev` 发起 Pull Request。

## Star History (Star 增长趋势)

<a href="https://www.star-history.com/?repos=Syngnat%2FGoNavi&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
 </picture>
</a>

## 友情链接

- [linux.do](https://linux.do/)
- [AI全书](https://aibook.ren/)

## 开源协议

本项目采用 [Apache-2.0 协议](LICENSE)。
