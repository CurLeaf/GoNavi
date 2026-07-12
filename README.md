# GoNavi - A Modern Lightweight Database Client

[![Go Version](https://img.shields.io/github/go-mod/go-version/Syngnat/GoNavi)](https://go.dev/)
[![Wails Version](https://img.shields.io/badge/Wails-v2-red)](https://wails.io)
[![React Version](https://img.shields.io/badge/React-v18-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Syngnat/GoNavi/release.yml?label=Build)](https://github.com/Syngnat/GoNavi/actions)
[![Stars](https://img.shields.io/github/stars/Syngnat/GoNavi?style=social)](https://github.com/Syngnat/GoNavi/stargazers)
[![Downloads](https://img.shields.io/github/downloads/Syngnat/GoNavi/total?color=blue&label=downloads)](https://github.com/Syngnat/GoNavi/releases)

**Language**: English | [简体中文](README.zh-CN.md)

GoNavi is a modern, high-performance, cross-platform database client built with **Wails (Go)** and **React**.
It delivers native-like responsiveness with low resource usage.

Compared with many Electron-based clients, GoNavi is typically smaller in binary size (around 10MB class), starts faster, and uses less memory.

---

## Project Overview

GoNavi is designed for developers and DBAs who need a unified desktop experience across multiple databases.

- **Native-performance architecture**: Wails (Go + WebView) with lightweight runtime overhead.
- **Large dataset usability**: virtualized rendering and optimized DataGrid workflows for high-volume tables.
- **Unified connectivity**: URI build/parse, SSH tunnel, proxy support, and on-demand driver activation.
- **Production-oriented workflow**: SQL editor, object management, batch export/backup, sync tools, execution logs, and update checks.

## Supported Data Sources

> `Built-in`: available out of the box.  
> `Optional driver agent`: install/enable via Driver Manager first.

| Category | Data Source | Driver Mode | Typical Capabilities |
|---|---|---|---|
| Relational | MySQL | Built-in | Schema browsing, SQL query, data editing, export/backup |
| Domestic DB | GoldenDB | Built-in | MySQL-compatible query workflow and distributed transaction scenarios |
| Relational | PostgreSQL | Built-in | Schema browsing, SQL query, data editing, object management |
| Relational | Oracle | Built-in | Query execution, object browsing, data editing |
| Cache | Redis | Built-in | Key browsing, command execution, encoding/view switch |
| Vector Database | Chroma | Built-in | Collection browsing, vector retrieval, metadata filtering |
| Vector Database | Qdrant | Built-in | Collection browsing, vector search, payload filtering |
| Vector Database | Milvus | Built-in | Collection browsing, vector search, scalar filtering |
| Message Queue | RocketMQ | Built-in | Topic browsing, consumer-group inspection, message-oriented workflow |
| Message Queue | MQTT | Built-in | Broker and topic-filter workflow with QoS-aware connection settings |
| Message Queue | Kafka | Built-in | Topic browsing, broker metadata, consumer-group workflow |
| Message Queue | RabbitMQ | Built-in | Queue/exchange browsing, virtual host inspection, management API workflow |
| Relational | MariaDB | Optional driver agent | Querying, object management, data editing |
| Relational | Doris | Optional driver agent | Querying, object browsing, SQL execution |
| Columnar Analytics | StarRocks | Optional driver agent | Querying, object browsing, SQL execution |
| Search | Sphinx | Optional driver agent | SphinxQL querying and object browsing |
| Relational | SQL Server | Optional driver agent | Schema browsing, SQL query, object management |
| File-based | SQLite | Optional driver agent | Local DB browsing, editing, export |
| File-based | DuckDB | Optional driver agent | Large-table query, pagination, file-DB workflow |
| Domestic DB | OceanBase | Optional driver agent | MySQL / Oracle tenant access, object browsing, query workflow |
| Domestic DB | Dameng | Optional driver agent | Querying, object browsing, data editing |
| Domestic DB | Kingbase | Optional driver agent | Querying, object browsing, data editing |
| Domestic DB | HighGo | Optional driver agent | Querying, object browsing, data editing |
| Domestic DB | Vastbase | Optional driver agent | Querying, object browsing, data editing |
| Domestic DB | OpenGauss | Optional driver agent | PostgreSQL-like schema browsing, SQL query, object management |
| Domestic DB | GaussDB | Optional driver agent | PostgreSQL-like schema browsing, SQL query, object management |
| Multi-model | InterSystems IRIS | Optional driver agent | Namespace browsing, SQL query, object management |
| Document | MongoDB | Optional driver agent | Document query, collection browsing, connection management |
| Time-series | TDengine | Optional driver agent | Time-series schema browsing and querying |
| Time-series | Apache IoTDB | Optional driver agent | Storage group / device / timeseries browsing and querying |
| Columnar Analytics | ClickHouse | Optional driver agent | Analytical query, object browsing, SQL execution |
| Federated Query | Trino | Optional driver agent | Cross-source SQL via multiple catalogs, `catalog.schema` browsing, SQL execution |
| Search | Elasticsearch | Optional driver agent | Index browsing, mapping inspection, JSON DSL / query_string search |
| Extensibility | Custom Driver/DSN | Custom | Extend to more data sources via Driver + DSN |

<h2 align="center">📸 Screenshots</h2>

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

## Key Features

### AI Assistant (New)
- **Multi-provider Support**: OpenAI, Google Gemini, Anthropic Claude, and custom API support.
- **Context-Aware Chat**: Attach table schemas to the AI context for accurate SQL generation and assistance.
- **Slash Commands**: Quick commands for generating SQL, explaining queries, optimizing performance, and reviewing schema designs.
- **Built-in MCP Workflow**: Manage MCP servers in AI Settings, install GoNavi MCP to Claude Code / Codex, or expose Streamable HTTP for remote Agents.
- **Remote-Agent Boundary**: Keep saved connections and database passwords on the host running GoNavi while cloud Agents consume schema tools over MCP.
- **Safety Guardrails**: Remote `schema-only` mode omits `execute_sql`; when SQL execution is enabled, non-read-only statements still require explicit `allowMutating=true`.

### Performance
- **Smooth interaction under load**: optimized table interaction (including column resize workflow on large datasets).
- **Virtualized rendering**: keeps large result sets responsive.

### Data Management (DataGrid)
- In-place cell editing.
- Batch insert/update/delete with transaction-oriented submit/rollback.
- Large-field popup editor.
- Context actions (set NULL, copy/export, etc.).
- Smart read/write mode switching based on query context.
- Export formats: CSV, Excel (XLSX), JSON, Markdown.

### SQL Editor
- Monaco Editor core.
- Context-aware completion for databases/tables/columns.
- Multi-tab query workflow.

### Batch Export / Backup
- Database-level and table-level batch export/backup.
- Scope-aware operation flow to reduce mistakes.

### Connectivity
- URI generation/parsing.
- SSH tunnel support.
- Proxy support.
- Config import/export (JSON).
- Optional driver management and activation.

### Redis Tools
- Multi-view value rendering (auto/raw text/UTF-8/hex).
- Built-in command execution panel.

### Observability and Update
- SQL execution logs with timing information.
- SQL audit center for persisted SQL-editor operations, transaction boundaries, data edits/imports, SQL-file jobs, data sync, object DDL, table design, message publishing, and built-in AI/MCP database actions, with filters, transaction timelines, JSON/CSV export, retention controls, and writer health.
- Audit content is redacted by default: Redis values and message payloads are hidden, while non-SQL operations that cannot be parsed safely retain metadata only. The audit database lives at `audit/sql_audit.db` under the active data root.
- SQL-file, import, and sync entries are privacy-safe task summaries (content hash, target/count metadata), not raw per-row evidence. Source values identify the called GoNavi entry point rather than an unforgeable user identity.
- The local SHA-256 hash chain is a consistency check, not a keyed signature or tamper-proof guarantee. Known persistence gaps are marked with `audit_gap` after recovery.
- Startup/scheduled/manual update checks.

### UI/UX
- Ant Design 5 based interface.
- Light/Dark themes.
- Flexible sidebar and layout behavior.

---

## Tech Stack

- **Backend**: Go 1.24 + Wails v2
- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Ant Design 5
- **State Management**: Zustand
- **Editor**: Monaco Editor

---

## Installation and Run

### Prerequisites
- [Go](https://go.dev/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation):
  `go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0`

### Development Mode

```shell
# Clone
git clone https://github.com/Syngnat/GoNavi.git
cd GoNavi

# Start development with hot reload
wails dev

# Faster local startup when exported Go method signatures are unchanged
node tools/wails-fast-dev.mjs

# Refresh Wails JS bindings after changing exported Go method signatures
node tools/wails-fast-dev.mjs --refresh-bindings

# Windows desktop builds use an opaque WebView without an Acrylic backdrop by default.
```

### Build

```bash
# Build for current platform
wails build

# Clean build (recommended before release)
wails build -clean
```

Artifacts are generated in `build/bin`.

### Browser Access Mode (Web Server, Experimental)

GoNavi provides a `web-server` mode that reuses the same Go backend and React frontend for browser access (**not** a containerized desktop Wails window).

#### Run locally

```powershell
go build .
.\GoNavi-Wails.exe web-server --addr 127.0.0.1:34116
```

Without a configured password, the first browser visit is redirected to `/setup` to create the web admin password. Google Authenticator is optional but supported out of the box, together with `web_auth.json`, session cookies, recovery codes, and login rate limiting.

Current scope already includes:

- Browser-side Wails bridge (`window.go.*` / `window.runtime.*` -> HTTP / SSE)
- First-run setup page, login page, and logout endpoint
- Session idle timeout / absolute timeout / remember-login window
- Google Authenticator TOTP plus recovery codes
- Docker / Compose packaging (below)

Still in progress:

- Browser upload/download workbenches for external SQL and connection-package flows
- More web capability gating for desktop-only features
- Reverse-proxy / HTTPS / zero-trust deployment guidance

#### Docker / Podman (Web Server)

```bash
cp docker.web-server.env.example docker.web-server.env
# set GONAVI_HOST_DATA_ROOT to an absolute path
# optionally set GONAVI_WEB_PASSWORD to at least 6 characters
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d
```

You can alternatively put the same variables in the project-level `.env` file and omit `--env-file docker.web-server.env`.

Open `http://127.0.0.1:34116` (or the mapped host port). When `GONAVI_WEB_PASSWORD` is set, a newly created container synchronizes it and opens the login page directly. Otherwise, complete `/setup` on first visit.

Mount the GoNavi active data root at `/data`. Prefer including `connections.json`, `daily_secrets.json`, and optional `drivers/`. Web auth state is stored as `web_auth.json` in that directory.

`GONAVI_WEB_PASSWORD` takes precedence over the password hash already stored in `web_auth.json`, while preserving 2FA and session settings. Removing the variable leaves the last synchronized password active. Treat the env file as a secret because the plaintext value is visible to users who can inspect the container; restrict its file permissions.

After changing the env password, recreate the container so Compose reloads the env file:

```bash
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d --force-recreate
```

Docker Desktop Restart and `docker restart` keep the old container environment and do not reload the env file.

On a new deployment, an environment password starts password-only authentication. To enable 2FA, leave `GONAVI_WEB_PASSWORD` empty for the initial `/setup`, then set it to the same password before recreating the container.

The container listens on `0.0.0.0:34116` by default (`GONAVI_WEB_ADDR`). **Do not expose an unhardened Web entrypoint to the public internet**; use a reverse proxy and HTTPS for production.

Default Compose pulls the GHCR image. For a local source build, add the override:

```bash
docker compose --env-file docker.web-server.env \
  -f docker-compose.web-server.yml \
  -f docker-compose.web-server.local.yml \
  up -d --build
```

Health check: `GET /__gonavi/healthz`.

### Docker / Podman (MCP Server)

Container packaging also provides `gonavi-mcp-server` (MCP HTTP only; no desktop GUI / Web UI).

```bash
cp docker.mcp-server.env.example docker.mcp-server.env
docker compose --env-file docker.mcp-server.env -f docker-compose.mcp-server.yml up -d
```

Mount the GoNavi active data root into the container. The mounted directory should contain `connections.json`, `daily_secrets.json`, and optional `drivers/` assets when optional driver agents are required.

The default Compose file pulls the published GHCR image. For local source builds, add the override file:

```bash
docker compose --env-file docker.mcp-server.env \
  -f docker-compose.mcp-server.yml \
  -f docker-compose.mcp-server.local.yml \
  up -d --build
```

For Podman, use the same published OCI image with `podman run`, or the native Quadlet example under [deploy/podman/gonavi-mcp-server](deploy/podman/gonavi-mcp-server). That path is intended for Linux servers / NAS hosts where rootless systemd services are preferred.

Deployment matrix:

- Web UI: `docker-compose.web-server.yml` (`ghcr.io/syngnat/gonavi-web-server`)
- MCP: `docker-compose.mcp-server.yml` (`ghcr.io/syngnat/gonavi-mcp-server`)
- Podman / Quadlet: [deploy/podman/gonavi-mcp-server](deploy/podman/gonavi-mcp-server)
- Kubernetes: [deploy/k8s/gonavi-mcp-server](deploy/k8s/gonavi-mcp-server) (`kustomization.yaml` + overlays)
- Helm chart: [deploy/helm/gonavi-mcp-server](deploy/helm/gonavi-mcp-server)
- Build-only Linux environment: `Dockerfile.build-env`

See [cmd/gonavi-mcp-server/README.md](cmd/gonavi-mcp-server/README.md) for deployment details and security boundaries.

### Docker / Podman (Build Environment Only)

If you only need a reproducible Linux build environment for Wails, use `Dockerfile.build-env`:

```bash
docker build -f Dockerfile.build-env -t gonavi-build-env:local .
docker run --rm -it -v "$PWD:/workspace" -w /workspace gonavi-build-env:local bash
```

The same Dockerfile also works with Podman, for example `podman build -f Dockerfile.build-env -t localhost/gonavi-build-env:local .` and `podman run --rm -it -v "$PWD:/workspace" -w /workspace localhost/gonavi-build-env:local bash`.

The default image installs the WebKitGTK 4.0 build toolchain for broader Linux/NAS compatibility. The image bases are multi-arch, so `amd64` and `arm64` follow the target container platform.

Published images are pushed to GHCR:

- `ghcr.io/syngnat/gonavi-web-server:latest`
- `ghcr.io/syngnat/gonavi-mcp-server:latest`
- `ghcr.io/syngnat/gonavi-build-env:latest`

This image is for building Linux artifacts only. It does not turn the Wails desktop GUI into a browser-accessible web application.

### Cross-Platform Release (GitHub Actions)

The repository includes a release workflow.
Push a `v*` tag to trigger automated build and release.
Release notes are generated automatically from merged pull requests and categorized by `.github/release.yaml`.

Target artifacts include:
- macOS (AMD64 / ARM64)
- Windows (AMD64)
- Linux (AMD64, WebKitGTK 4.0 and 4.1 variants)

---

## Troubleshooting

### macOS: "App is damaged and can’t be opened"

Without Apple notarization, Gatekeeper may block startup.

1. Move `GoNavi.app` to **Applications**.
2. Open **Terminal**.
3. Run:

```bash
sudo xattr -rd com.apple.quarantine /Applications/GoNavi.app
```

Or right-click the app in Finder and choose **Open** with Control key flow.

### Linux: missing `libwebkit2gtk` / `libjavascriptcoregtk`

GoNavi depends on WebKitGTK runtime libraries.

```bash
# Debian 13 / Ubuntu 24.04+
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0

# Ubuntu 22.04 / Debian 12
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.0-37 libjavascriptcoregtk-4.0-18
```

If you use Linux artifacts with the `-WebKit41` suffix, prefer Debian 13 / Ubuntu 24.04+.

### Linux: Chinese text appears as square boxes

Minimal Ubuntu 24.04 LTS desktop/server environments may not include Chinese CJK fonts. Install Noto / WenQuanYi fonts and restart GoNavi:

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk fonts-wqy-microhei
fc-cache -fv
```

---

## Contributing

Issues and pull requests are welcome.

For the full workflow, branch model, and maintainer sync rules, see:

- [CONTRIBUTING.md](CONTRIBUTING.md)

External contributors should branch from `dev` and open pull requests against `dev`.

## Star History
<a href="https://www.star-history.com/?repos=Syngnat%2FGoNavi&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
 </picture>
</a>

## Links

- [linux.do](https://linux.do/)
- [AIBook](https://aibook.ren/)

## License

Licensed under [Apache-2.0](LICENSE).
