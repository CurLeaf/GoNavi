package app

import (
	"encoding/base64"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
)

// SetApplicationBrandIcon updates the OS application icon (macOS Dock) from a
// PNG payload. Frontend may pass raw base64 or a data URL (data:image/png;base64,...).
// On non-macOS platforms this is currently a no-op success.
func (a *App) SetApplicationBrandIcon(imageBase64 string) (result connection.QueryResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			logger.Errorf("设置应用图标失败：%v", recovered)
			result = connection.QueryResult{
				Success: false,
				Message: a.appText("app.backend.error.set_brand_icon_failed", map[string]any{
					"detail": fmt.Sprint(recovered),
				}),
			}
		}
	}()

	raw := strings.TrimSpace(imageBase64)
	if raw == "" {
		return connection.QueryResult{Success: false, Message: "empty icon payload"}
	}
	if idx := strings.Index(raw, ","); idx >= 0 && strings.Contains(strings.ToLower(raw[:idx]), "base64") {
		raw = raw[idx+1:]
	}
	// tolerate whitespace/newlines in base64
	raw = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, raw)

	png, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		// try raw URL encoding without padding issues
		png, err = base64.RawStdEncoding.DecodeString(raw)
	}
	if err != nil {
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("invalid base64 png: %v", err)}
	}
	if len(png) < 8 || string(png[:8]) != "\x89PNG\r\n\x1a\n" {
		return connection.QueryResult{Success: false, Message: "payload is not a PNG image"}
	}
	if err := setApplicationIconPNG(png); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "application icon updated"}
}
