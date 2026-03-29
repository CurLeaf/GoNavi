//go:build !dev

package main

import (
	"embed"
	"io/fs"
)

//go:embed all:frontend/dist
var embeddedAssets embed.FS

var assets fs.FS = embeddedAssets
