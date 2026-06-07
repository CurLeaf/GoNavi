param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ClaudeArgs = $args

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binDir = Join-Path $repoRoot 'bin'
$serverExe = Join-Path $binDir 'gonavi-mcp-server.exe'

if (-not $SkipBuild) {
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir | Out-Null
    }

    & go build -o $serverExe .\cmd\gonavi-mcp-server
    if ($LASTEXITCODE -ne 0) {
        throw "构建 gonavi-mcp-server 失败"
    }
} elseif (-not (Test-Path $serverExe)) {
    throw "未找到已编译的 gonavi-mcp-server.exe，请去掉 -SkipBuild 或先手动构建"
}

$mcpConfig = @{
    mcpServers = @{
        gonavi = @{
            type = 'stdio'
            command = $serverExe
            args = @()
            env = @{}
        }
    }
} | ConvertTo-Json -Compress -Depth 6

$tempConfig = Join-Path ([System.IO.Path]::GetTempPath()) ("gonavi-claude-mcp-" + [System.Guid]::NewGuid().ToString("N") + ".json")

try {
    Set-Content -LiteralPath $tempConfig -Value $mcpConfig -Encoding UTF8
    & claude @ClaudeArgs --mcp-config $tempConfig --strict-mcp-config
    exit $LASTEXITCODE
} finally {
    Remove-Item -LiteralPath $tempConfig -ErrorAction SilentlyContinue
}
