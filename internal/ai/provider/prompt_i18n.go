package provider

import (
	"strings"

	"GoNavi-Wails/internal/ai"
)

const (
	providerImageFallbackPromptKey = "ai_service.backend.provider.image_fallback_prompt"
	providerImageOmittedNoticeKey  = "ai_service.backend.provider.image_omitted_notice"
)

func providerImageFallbackPrompt(prompt string) string {
	if text := strings.TrimSpace(prompt); text != "" {
		return text
	}
	return "Please describe and analyze this image."
}

func providerImageOmittedNotice(notice string) string {
	if text := strings.TrimSpace(notice); text != "" {
		return text
	}
	return "[Image omitted: the current model or upstream API does not support image input. Switch to a vision-capable model and resend the image.]"
}

func applyImageFallbackPrompt(messages []ai.Message, prompt string) []ai.Message {
	fallback := providerImageFallbackPrompt(prompt)
	var result []ai.Message
	for index, message := range messages {
		if len(message.Images) == 0 || strings.TrimSpace(message.Content) != "" {
			continue
		}
		if result == nil {
			result = make([]ai.Message, len(messages))
			copy(result, messages)
		}
		result[index].Content = fallback
	}
	if result != nil {
		return result
	}
	return messages
}

func providerImageFallbackPromptCatalogKey() string {
	return providerImageFallbackPromptKey
}

func providerImageOmittedNoticeCatalogKey() string {
	return providerImageOmittedNoticeKey
}
