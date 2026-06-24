package jvm

import (
	"sync"

	"GoNavi-Wails/shared/i18n"
)

var (
	jvmBackendTextMu        sync.RWMutex
	jvmBackendTextLanguage  = i18n.LanguageZhCN
	jvmBackendTextLocalizer *i18n.Localizer
)

func SetBackendLanguage(language i18n.Language) {
	normalized, ok := i18n.NormalizeLanguage(string(language))
	if !ok {
		return
	}

	jvmBackendTextMu.Lock()
	defer jvmBackendTextMu.Unlock()

	jvmBackendTextLanguage = normalized
	if jvmBackendTextLocalizer == nil {
		localizer, err := i18n.NewLocalizer(normalized)
		if err != nil {
			return
		}
		jvmBackendTextLocalizer = localizer
		return
	}
	jvmBackendTextLocalizer.SetLanguage(normalized)
}

func localizedJVMBackendText(key string, params map[string]any) string {
	jvmBackendTextMu.RLock()
	if jvmBackendTextLocalizer != nil {
		text := jvmBackendTextLocalizer.T(key, params)
		jvmBackendTextMu.RUnlock()
		return text
	}
	jvmBackendTextMu.RUnlock()

	jvmBackendTextMu.Lock()
	defer jvmBackendTextMu.Unlock()

	if jvmBackendTextLocalizer == nil {
		localizer, err := i18n.NewLocalizer(jvmBackendTextLanguage)
		if err != nil {
			return key
		}
		jvmBackendTextLocalizer = localizer
	}
	return jvmBackendTextLocalizer.T(key, params)
}
