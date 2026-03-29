//go:build dev

package main

import "os"

// 开发模式下由 Wails DevServer 提供前端资源，这里只提供一个稳定的占位 FS，
// 避免编译时依赖 frontend/dist 被并发重建。
var assets = os.DirFS(".")
