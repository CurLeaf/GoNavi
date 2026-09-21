package app

import _ "embed"

// Windows 快捷方式品牌图标修复脚本。
//
// 脚本在执行前才写到本地临时目录，属于本机未签名的 PowerShell 脚本，因此用
// RemoteSigned（允许本地脚本、仍校验远程签名），而不是关闭策略检查。
//
//go:embed windows_shortcut_repair.ps1
var windowsShortcutRepairPowerShellScript string

// windowsEmbeddedPowerShellExecutionPolicy 是运行内嵌 PowerShell 脚本时使用的执行策略。
const windowsEmbeddedPowerShellExecutionPolicy = "RemoteSigned"
