package aiservice

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/secretstore"
)

const providerSecretKind = "ai-provider"

type providerSecretBundle struct {
	APIKey           string            `json:"apiKey,omitempty"`
	SensitiveHeaders map[string]string `json:"sensitiveHeaders,omitempty"`
}

func (b providerSecretBundle) hasAny() bool {
	return strings.TrimSpace(b.APIKey) != "" || len(b.SensitiveHeaders) > 0
}

func mergeProviderSecretBundles(base, overlay providerSecretBundle) providerSecretBundle {
	merged := providerSecretBundle{
		APIKey:           base.APIKey,
		SensitiveHeaders: cloneStringMap(base.SensitiveHeaders),
	}
	if strings.TrimSpace(overlay.APIKey) != "" {
		merged.APIKey = overlay.APIKey
	}
	for key, value := range overlay.SensitiveHeaders {
		if merged.SensitiveHeaders == nil {
			merged.SensitiveHeaders = make(map[string]string, len(overlay.SensitiveHeaders))
		}
		merged.SensitiveHeaders[key] = value
	}
	if len(merged.SensitiveHeaders) == 0 {
		merged.SensitiveHeaders = nil
	}
	return merged
}

func splitProviderSecrets(cfg ai.ProviderConfig) (ai.ProviderConfig, providerSecretBundle) {
	meta := cfg
	meta.APIKey = ""

	bundle := providerSecretBundle{}
	if apiKey := strings.TrimSpace(cfg.APIKey); apiKey != "" {
		bundle.APIKey = apiKey
	}

	if len(cfg.Headers) > 0 {
		safeHeaders := make(map[string]string, len(cfg.Headers))
		sensitiveHeaders := make(map[string]string)
		for key, value := range cfg.Headers {
			if isSensitiveProviderHeader(key) {
				if strings.TrimSpace(value) != "" {
					sensitiveHeaders[key] = value
				}
				continue
			}
			safeHeaders[key] = value
		}
		if len(safeHeaders) > 0 {
			meta.Headers = safeHeaders
		} else {
			meta.Headers = nil
		}
		if len(sensitiveHeaders) > 0 {
			bundle.SensitiveHeaders = sensitiveHeaders
		}
	} else {
		meta.Headers = nil
	}

	meta.HasSecret = cfg.HasSecret || bundle.hasAny()
	meta.SecretRef = strings.TrimSpace(cfg.SecretRef)
	if meta.HasSecret && meta.SecretRef == "" && strings.TrimSpace(cfg.ID) != "" {
		if ref, err := secretstore.BuildRef(providerSecretKind, cfg.ID); err == nil {
			meta.SecretRef = ref
		}
	}
	if !meta.HasSecret {
		meta.SecretRef = ""
	}

	return meta, bundle
}

func mergeProviderSecrets(cfg ai.ProviderConfig, bundle providerSecretBundle) ai.ProviderConfig {
	merged := cfg
	merged.APIKey = bundle.APIKey

	headers := cloneStringMap(cfg.Headers)
	if len(bundle.SensitiveHeaders) > 0 {
		if headers == nil {
			headers = make(map[string]string, len(bundle.SensitiveHeaders))
		}
		for key, value := range bundle.SensitiveHeaders {
			headers[key] = value
		}
	}
	if len(headers) > 0 {
		merged.Headers = headers
	} else {
		merged.Headers = nil
	}

	merged.HasSecret = cfg.HasSecret || bundle.hasAny()
	if merged.HasSecret && strings.TrimSpace(merged.SecretRef) == "" && strings.TrimSpace(merged.ID) != "" {
		if ref, err := secretstore.BuildRef(providerSecretKind, merged.ID); err == nil {
			merged.SecretRef = ref
		}
	}
	if !merged.HasSecret {
		merged.SecretRef = ""
	}

	return merged
}

func persistProviderSecretBundle(store secretstore.SecretStore, meta ai.ProviderConfig, bundle providerSecretBundle) (ai.ProviderConfig, error) {
	meta, _ = splitProviderSecrets(meta)
	if !bundle.hasAny() {
		meta.HasSecret = false
		meta.SecretRef = ""
		return meta, nil
	}
	if store == nil {
		return meta, fmt.Errorf("secret store unavailable")
	}
	if err := store.HealthCheck(); err != nil {
		return meta, err
	}

	ref := strings.TrimSpace(meta.SecretRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(providerSecretKind, meta.ID)
		if err != nil {
			return meta, err
		}
	}

	payload, err := json.Marshal(bundle)
	if err != nil {
		return meta, fmt.Errorf("序列化 provider secret bundle 失败: %w", err)
	}
	if err := store.Put(ref, payload); err != nil {
		return meta, err
	}

	meta.SecretRef = ref
	meta.HasSecret = true
	return meta, nil
}

func resolveProviderConfigSecrets(store secretstore.SecretStore, cfg ai.ProviderConfig) (ai.ProviderConfig, error) {
	cfg = normalizeProviderConfig(cfg)
	meta, bundle := splitProviderSecrets(cfg)
	if bundle.hasAny() {
		return mergeProviderSecrets(meta, bundle), nil
	}
	if !meta.HasSecret {
		return meta, nil
	}
	if store == nil {
		return meta, fmt.Errorf("secret store unavailable")
	}

	ref := strings.TrimSpace(meta.SecretRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(providerSecretKind, meta.ID)
		if err != nil {
			return meta, err
		}
		meta.SecretRef = ref
	}

	payload, err := store.Get(ref)
	if err != nil {
		return meta, err
	}

	var stored providerSecretBundle
	if err := json.Unmarshal(payload, &stored); err != nil {
		return meta, fmt.Errorf("解析 provider secret bundle 失败: %w", err)
	}
	return mergeProviderSecrets(meta, stored), nil
}

func (s *Service) persistProviderSecretBundle(meta ai.ProviderConfig, bundle providerSecretBundle) (ai.ProviderConfig, error) {
	return persistProviderSecretBundle(s.secretStore, meta, bundle)
}

func (s *Service) resolveProviderConfigSecrets(cfg ai.ProviderConfig) (ai.ProviderConfig, error) {
	return resolveProviderConfigSecrets(s.secretStore, cfg)
}

func providerMetadataView(cfg ai.ProviderConfig) ai.ProviderConfig {
	meta, _ := splitProviderSecrets(normalizeProviderConfig(cfg))
	return meta
}

func isSensitiveProviderHeader(name string) bool {
	normalized := strings.TrimSpace(strings.ToLower(name))
	switch normalized {
	case "authorization", "proxy-authorization", "x-api-key", "api-key":
		return true
	}

	for _, token := range providerHeaderTokens(normalized) {
		switch token {
		case "auth", "authorization", "token", "secret", "key", "apikey":
			return true
		}
	}

	return false
}

func providerHeaderTokens(name string) []string {
	return strings.FieldsFunc(name, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}
