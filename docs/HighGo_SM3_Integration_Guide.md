# HighGo SM3 国密驱动集成指南

## 一、背景说明

HighGo（瀚高）数据库需要使用支持 SM3 国密认证的 PostgreSQL 驱动。瀚高官方提供了基于 `lib/pq` 的安全增强版本。

## 二、集成步骤

### 步骤 1：下载瀚高 pq 驱动

1. 访问百度网盘链接：
   ```
   https://pan.baidu.com/s/1xuz6uJz0utRgKWecXhpOiA?pwd=o0tj
   ```

2. 下载驱动源码压缩包

### 步骤 2：放置驱动源码

1. 在项目根目录创建目录（如果不存在）：
   ```bash
   mkdir -p third_party/highgo-pq
   ```

2. 解压下载的驱动源码到 `third_party/highgo-pq/` 目录

3. 确保目录结构如下：
   ```
   GoNavi/
   ├── third_party/
   │   └── highgo-pq/
   │       ├── go.mod
   │       ├── conn.go
   │       ├── ... (其他 pq 驱动源文件)
   ```

### 步骤 3：修改 go.mod

在 `go.mod` 中添加独立的 HighGo 驱动依赖与本地替换：

```go
require github.com/highgo/pq-sm3 v0.0.0
replace github.com/highgo/pq-sm3 => ./third_party/highgo-pq
```

完整示例：
```go
module GoNavi-Wails

go 1.24.3

require (
    // ... 现有依赖
    github.com/lib/pq v1.11.1
    github.com/highgo/pq-sm3 v0.0.0
    // ... 其他依赖
)

// 在文件末尾添加
replace github.com/highgo/pq-sm3 => ./third_party/highgo-pq
```

并将 `third_party/highgo-pq/go.mod` 的 module 修改为：

```go
module github.com/highgo/pq-sm3
```

同时在驱动源码中把注册名改为 `highgo`，确保不覆盖 `postgres`：

```go
sql.Register("highgo", &Driver{})
```

### 步骤 4：更新 HighGo 连接配置（可选）

根据瀚高官方文档，建议修改 `internal/db/highgo_impl.go:43` 的 sslmode：

**当前代码**：
```go
q.Set("sslmode", "disable")
```

**建议修改为**（瀚高默认）：
```go
q.Set("sslmode", "require")
```

> ⚠️ 注意：如果您的 HighGo 服务器未配置 SSL，保持 `disable` 即可。

### 步骤 5：验证集成

1. 清理依赖缓存：
   ```bash
   go clean -modcache
   ```

2. 重新下载依赖：
   ```bash
   go mod download
   ```

3. 编译项目：
   ```bash
   go build ./...
   ```

4. 测试 HighGo 连接：
   - 启动应用
   - 创建 HighGo 连接
   - 测试连接是否成功

## 三、重要说明

### ⚠️ 影响范围

采用独立驱动名后，影响范围如下：

1. **PostgreSQL 继续使用原生 `github.com/lib/pq`**
2. **HighGo 使用 `github.com/highgo/pq-sm3`（本地替换到官方源码）**
3. 两条连接链路互不覆盖，降低兼容性风险

### 兼容性验证

集成后，请务必测试：

1. ✅ HighGo 数据库连接（SM3 认证）
2. ✅ 标准 PostgreSQL 连接（确保仍然可用）

若 PostgreSQL 或 HighGo 任一连接异常，优先检查驱动注册名与 `go.mod` replace 是否一致。

### 回滚方案

如果集成后出现问题，可以快速回滚：

1. 删除 `go.mod` 中的 replace 指令
2. 删除 `go.mod` 中 `github.com/highgo/pq-sm3` 的 require
3. 删除 `third_party/highgo-pq/` 目录
4. 运行 `go mod tidy`
5. 重新编译

## 四、瀚高驱动特性

根据官方文档：

- **项目内包路径**：`github.com/highgo/pq-sm3`（映射到本地 `third_party/highgo-pq`）
- **驱动名**：`highgo`（项目内独立注册，避免覆盖 `postgres`）
- **SM3 支持**：自动启用国密认证
- **默认端口**：5866
- **默认数据库**：`highgo`
- **默认用户**：`sysdba`
- **sslmode 默认**：`require`

## 五、故障排查

### 问题 1：编译失败

**现象**：`go build` 报错找不到 `github.com/highgo/pq-sm3`

**解决**：
1. 检查 `third_party/highgo-pq/` 目录是否存在
2. 检查 `go.mod` 中 `github.com/highgo/pq-sm3` 的 require/replace 是否正确
3. 运行 `go mod download`

### 问题 2：HighGo 连接失败

**现象**：连接 HighGo 时报认证错误

**解决**：
1. 确认瀚高驱动已正确替换（检查 `go.mod`）
2. 确认项目内驱动注册名为 `highgo`
3. 确认 HighGo 服务器支持 SM3 认证
4. 检查用户名、密码、端口是否正确

### 问题 3：PostgreSQL 连接失败

**现象**：集成后标准 PostgreSQL 无法连接

**解决**：
1. 检查是否误将 `github.com/lib/pq` 全局 replace 到 HighGo 驱动
2. 确认 PostgreSQL 仍使用 `sql.Open("postgres", dsn)`
3. 确认 HighGo 使用 `sql.Open("highgo", dsn)`

## 六、后续优化建议

如果后续需要增强，可考虑：

1. 将 HighGo `sslmode` 做成可配置项（前后端联动）
2. 增加 HighGo/PG 驱动链路健康检查项
3. 联系瀚高技术支持确认 SM3 + SSL 最佳参数组合

## 七、参考资料

- 瀚高官方文档：https://www.highgo.com/document/zh-cn/application/pq%E6%8E%A5%E5%8F%A3.html
- 瀚高驱动下载：https://pan.baidu.com/s/1xuz6uJz0utRgKWecXhpOiA?pwd=o0tj
- 标准 lib/pq：https://github.com/lib/pq
