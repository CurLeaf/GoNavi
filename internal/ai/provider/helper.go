package provider

import (
	"fmt"
	"strings"
)

// ParseDataURI 解析前端传递的 Data URI，返回 mimeType 和去掉前缀的 rawBase64
func ParseDataURI(dataURI string) (mimeType, rawBase64 string, err error) {
	if !strings.HasPrefix(dataURI, "data:") {
		// 如果前端漏了前缀，默认容错当做 jpeg 处理
		return "image/jpeg", dataURI, nil
	}
	parts := strings.SplitN(dataURI, ",", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid data URI format")
	}
	meta := strings.TrimPrefix(parts[0], "data:")
	metaParts := strings.Split(meta, ";")
	mimeType = metaParts[0]
	if mimeType == "" {
		mimeType = "image/jpeg" // fallback
	}
	rawBase64 = parts[1]
	return mimeType, rawBase64, nil
}
