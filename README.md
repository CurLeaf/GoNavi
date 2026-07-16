<p align="center">
  <img src="assets/readme-logo.png" width="128" alt="GoNavi Logo" />
</p>

<h1 align="center">GoNavi</h1>

<p align="center">
  <b>Navigate every data source — native speed, agent-ready, zero Electron bloat.</b>
</p>

<p align="center">
  A high-performance cross-platform database client built with
  <a href="https://wails.io">Wails</a> (Go) + <a href="https://react.dev">React</a>.
  Desktop-first. MCP-ready. ~10MB class binaries.
</p>

<p align="center">
  <a href="https://github.com/Syngnat/GoNavi/releases"><img src="https://img.shields.io/github/v/release/Syngnat/GoNavi?style=for-the-badge&color=8B5CF6" alt="Release" /></a>
  <a href="https://github.com/Syngnat/GoNavi/releases"><img src="https://img.shields.io/github/downloads/Syngnat/GoNavi/total?style=for-the-badge&color=6366F1&label=downloads" alt="Downloads" /></a>
  <a href="https://github.com/Syngnat/GoNavi/stargazers"><img src="https://img.shields.io/github/stars/Syngnat/GoNavi?style=for-the-badge&color=F59E0B" alt="Stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-22C55E?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <a href="https://go.dev"><img src="https://img.shields.io/github/go-mod/go-version/Syngnat/GoNavi?style=flat-square&logo=go&logoColor=white&label=Go" alt="Go" /></a>
  <a href="https://wails.io"><img src="https://img.shields.io/badge/Wails-v2-red?style=flat-square" alt="Wails" /></a>
  <a href="https://reactjs.org"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" /></a>
  <a href="https://github.com/Syngnat/GoNavi/actions"><img src="https://img.shields.io/github/actions/workflow/status/Syngnat/GoNavi/release.yml?style=flat-square&label=Build" alt="Build" /></a>
</p>

<p align="center">
  <b>Language</b>: English · <a href="README.zh-CN.md">简体中文</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Syngnat/GoNavi/releases"><b>⬇ Download</b></a>
  ·
  <a href="#-quick-start"><b>⚡ Quick Start</b></a>
  ·
  <a href="#-key-features"><b>✨ Features</b></a>
  ·
  <a href="#-mcp--agents"><b>🤖 MCP</b></a>
</p>

---

## Why GoNavi?

Most database GUIs are Electron shells with megabytes of tax. GoNavi takes a different path:

| | Typical Electron client | **GoNavi** |
|---|---|---|
| Runtime | Chromium + Node | **Go + native WebView** |
| Binary size | Hundreds of MB | **~10MB class** |
| Startup | Heavy | **Fast** |
| Memory | High baseline | **Lean** |
| AI / Agents | Bolt-on or absent | **First-class MCP + multi-provider AI** |
| Data sources | Mostly RDBMS | **SQL · Cache · Vector · MQ · Search · Time-series · Domestic DBs** |

> **One cockpit for MySQL, Postgres, Redis, Kafka, Milvus, OceanBase, ClickHouse…**  
> Query, edit, audit, sync — and hand structured context to coding agents without leaking passwords off-host.

---

## At a Glance

```text
┌──────────────────────────────────────────────────────────────────────┐
│  GoNavi Workbench                                                    │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ Connections │  │ Monaco SQL + AI  │  │ Virtualized DataGrid    │  │
│  │ SSH / Proxy │  │ Schema context   │  │ Batch edit · Export     │  │
│  │ Drivers     │  │ Slash commands   │  │ Txn submit / rollback   │  │
│  └─────────────┘  └────────┬─────────┘  └─────────────────────────┘  │
│                            │                                         │
│              ┌─────────────▼─────────────┐                           │
│              │  Go core · Audit · Sync   │                           │
│              │  MCP HTTP · Web Server    │                           │
│              └───────────────────────────┘                           │
└──────────────────────────────────────────────────────────────────────┘
```

### Product screenshots

Each image is a **full GoNavi application window**, scaled proportionally for README display.

<p align="center">
  <img src="https://raw.githubusercontent.com/Syngnat/GoNavi/dev/assets/screenshots/01-home-workbench.png" alt="GoNavi full window — connections, queries, and workbench" width="560" />
  &nbsp;
  <img src="https://raw.githubusercontent.com/Syngnat/GoNavi/dev/assets/screenshots/04-ai-assistant.png" alt="GoNavi full window — AI assistant with schema context" width="560" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Syngnat/GoNavi/dev/assets/screenshots/06-new-connection.png" alt="GoNavi full window — new connection data-source selector" width="560" />
</p>

<p align="center"><sub>Real desktop captures · full window</sub></p>

---

## ✨ Key Features

<table>
<tr>
<td width="50%" valign="top">

### 🤖 AI that knows your schema
- OpenAI · Gemini · Claude · custom OpenAI-compatible APIs  
- Attach live table schemas as context  
- Slash commands: generate SQL, explain, optimize, review  
- **MCP**: install into Claude Code / Codex, or Streamable HTTP for remote agents  
- Secrets stay on the GoNavi host — agents get tools, not raw passwords  

</td>
<td width="50%" valign="top">

### ⚡ Built for large data
- Virtualized DataGrid for heavy result sets  
- In-place cell edit · batch CRUD · transaction submit/rollback  
- Large-field popup editor · smart read/write modes  
- Export: CSV · XLSX · JSON · Markdown  
- Monaco editor with context-aware completion  

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔌 Connectivity without drama
- URI generate / parse  
- SSH tunnel · proxy  
- Connection JSON import / export  
- On-demand optional driver agents  
- Custom Driver + DSN extensibility  

</td>
<td width="50%" valign="top">

### 🛡️ Observable & shippable
- SQL execution logs with timing  
- Audit center (redacted by default, retention, export)  
- Desktop + experimental **Web Server** mode  
- Docker / K8s / Helm / Podman packaging  
- Auto update checks · multi-arch releases  

</td>
</tr>
</table>

### 🧩 Stack

`Go 1.24` · `Wails v2` · `React 18` · `TypeScript` · `Vite` · `Ant Design 5` · `Zustand` · `Monaco`

---

## 🗄 Supported Data Sources

> **Built-in** — ready out of the box · **Optional agent** — install via Driver Manager

| | |
|---|---|
| **Built-in** | MySQL · GoldenDB · PostgreSQL · Oracle · Redis · Chroma · Qdrant · Milvus · RocketMQ · MQTT · Kafka · RabbitMQ |
| **Optional** | MariaDB · Doris · StarRocks · Sphinx · SQL Server · SQLite · DuckDB · OceanBase · Dameng · Kingbase · HighGo · Vastbase · OpenGauss · GaussDB · IRIS · MongoDB · TDengine · IoTDB · ClickHouse · Trino · Elasticsearch · Custom Driver/DSN |

<details>
<summary><b>Full capability matrix</b></summary>

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

</details>

---

## 🚀 Quick Start

### Prerequisites

- [Go](https://go.dev/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
```

### Develop

```bash
git clone https://github.com/Syngnat/GoNavi.git
cd GoNavi

wails dev                          # full hot reload
node tools/wails-fast-dev.mjs      # faster when Go exports unchanged
node tools/wails-fast-dev.mjs --refresh-bindings  # after Go export signature changes
```

### Build

```bash
wails build
wails build -clean   # clean build before release
```

Artifacts → `build/bin`.

### Prefer a binary?

Grab the latest build from **[Releases](https://github.com/Syngnat/GoNavi/releases)**  
(macOS AMD64/ARM64 · Windows AMD64 · Linux WebKitGTK 4.0/4.1).

---

## 🌐 Web Server (Experimental)

Same Go backend + React UI over HTTP — **not** a containerized Wails window.

```powershell
go build .
.\GoNavi-Wails.exe web-server --addr 127.0.0.1:34116
```

- First visit → `/setup` (admin password; optional Google Authenticator)
- Bridge: `window.go.*` / `window.runtime.*` → HTTP / SSE
- Sessions, recovery codes, login rate limits

#### Docker / Podman

```bash
cp docker.web-server.env.example docker.web-server.env
# set GONAVI_HOST_DATA_ROOT (absolute path)
# optional: GONAVI_WEB_PASSWORD (min 6 chars)
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d
```

Open `http://127.0.0.1:34116`. Mount the active data root at `/data`  
(`connections.json`, `daily_secrets.json`, optional `drivers/`).  
Auth state → `web_auth.json`.

> **Do not expose an unhardened web entry to the public internet.** Use reverse proxy + HTTPS in production.

Health: `GET /__gonavi/healthz`  
Local source build: add `-f docker-compose.web-server.local.yml --build`.

After changing env passwords:

```bash
docker compose --env-file docker.web-server.env -f docker-compose.web-server.yml up -d --force-recreate
```

(`docker restart` does **not** reload env files.)

---

## 🤖 MCP & Agents

Ship schema tools to agents without shipping your vault:

```bash
cp docker.mcp-server.env.example docker.mcp-server.env
docker compose --env-file docker.mcp-server.env -f docker-compose.mcp-server.yml up -d
```

| Surface | Entry |
|---|---|
| MCP container | `docker-compose.mcp-server.yml` → `ghcr.io/syngnat/gonavi-mcp-server` |
| Web UI container | `docker-compose.web-server.yml` → `ghcr.io/syngnat/gonavi-web-server` |
| Podman / Quadlet | [deploy/podman/gonavi-mcp-server](deploy/podman/gonavi-mcp-server) |
| Kubernetes | [deploy/k8s/gonavi-mcp-server](deploy/k8s/gonavi-mcp-server) |
| Helm | [deploy/helm/gonavi-mcp-server](deploy/helm/gonavi-mcp-server) |
| Build-only image | `Dockerfile.build-env` → `ghcr.io/syngnat/gonavi-build-env` |

Safety defaults: remote `schema-only` omits `execute_sql`; mutating SQL requires explicit `allowMutating=true`.  
Details: [cmd/gonavi-mcp-server/README.md](cmd/gonavi-mcp-server/README.md).

### Linux build environment only

```bash
docker build -f Dockerfile.build-env -t gonavi-build-env:local .
docker run --rm -it -v "$PWD:/workspace" -w /workspace gonavi-build-env:local bash
```

---

## 📦 Release Pipeline

Push a `v*` tag → GitHub Actions builds multi-arch releases.  
Notes auto-generated from merged PRs via `.github/release.yaml`.

---

## 🛠 Troubleshooting

<details>
<summary><b>macOS: “App is damaged and can’t be opened”</b></summary>

Without Apple notarization, Gatekeeper may block the app:

```bash
sudo xattr -rd com.apple.quarantine /Applications/GoNavi.app
```

Or right-click → Open (Control-click flow). Move the app to **Applications** first.

</details>

<details>
<summary><b>Linux: missing WebKitGTK</b></summary>

```bash
# Debian 13 / Ubuntu 24.04+
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0

# Ubuntu 22.04 / Debian 12
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.0-37 libjavascriptcoregtk-4.0-18
```

Artifacts with `-WebKit41` prefer Debian 13 / Ubuntu 24.04+.

</details>

<details>
<summary><b>Linux: Chinese glyphs as tofu boxes</b></summary>

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk fonts-wqy-microhei
fc-cache -fv
```

</details>

---

## 🤝 Contributing

Issues and PRs welcome. Branch from **`dev`**, PR against **`dev`**.

- [CONTRIBUTING.md](CONTRIBUTING.md)

---

## ⭐ Star History

<a href="https://www.star-history.com/?repos=Syngnat%2FGoNavi&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Syngnat/GoNavi&type=date&legend=top-left" />
 </picture>
</a>

---

## Links

- [linux.do](https://linux.do/)
- [AIBook](https://aibook.ren/)

## License

[Apache-2.0](LICENSE)

<p align="center">
  <sub>Built for people who live in SQL, schemas, and agent loops.</sub>
</p>
