package webserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"
)

func TestResolveWebAuthLanguagePriority(t *testing.T) {
	t.Run("query overrides cookie and accept-language", func(t *testing.T) {
		request := httptest.NewRequest("GET", "/login?lang=ja-JP", nil)
		request.AddCookie(&http.Cookie{Name: webAuthLanguageCookieName, Value: "de-DE"})
		request.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

		if got := resolveWebAuthLanguage(request); got != i18n.LanguageJaJP {
			t.Fatalf("resolveWebAuthLanguage()=%q, want %q", got, i18n.LanguageJaJP)
		}
	})

	t.Run("cookie overrides accept-language", func(t *testing.T) {
		request := httptest.NewRequest("GET", "/login", nil)
		request.AddCookie(&http.Cookie{Name: webAuthLanguageCookieName, Value: "de-DE"})
		request.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

		if got := resolveWebAuthLanguage(request); got != i18n.LanguageDeDE {
			t.Fatalf("resolveWebAuthLanguage()=%q, want %q", got, i18n.LanguageDeDE)
		}
	})

	t.Run("accept-language is used as fallback", func(t *testing.T) {
		request := httptest.NewRequest("GET", "/login", nil)
		request.Header.Set("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8")

		if got := resolveWebAuthLanguage(request); got != i18n.LanguageZhTW {
			t.Fatalf("resolveWebAuthLanguage()=%q, want %q", got, i18n.LanguageZhTW)
		}
	})
}

func TestRenderAuthPageUsesLocalizedCopyAndSolidColors(t *testing.T) {
	localizer := newWebAuthLocalizer(i18n.LanguageZhCN)
	if localizer == nil {
		t.Fatal("expected localized auth page localizer")
	}

	page := renderAuthPage(
		i18n.LanguageZhCN,
		webAuthText(localizer, "web_auth.page.setup.title", nil),
		webAuthText(localizer, "web_auth.page.setup.subtitle", nil),
		renderSetupBody(localizer),
		renderSetupScript(localizer),
	)

	for _, fragment := range []string{
		`lang="zh-CN"`,
		"初始化 GoNavi Web",
		"发行方",
		"账户",
		"至少 6 位",
	} {
		if !strings.Contains(page, fragment) {
			t.Fatalf("expected rendered page to contain %q", fragment)
		}
	}

	if strings.Contains(page, "radial-gradient") || strings.Contains(page, "linear-gradient") {
		t.Fatalf("expected auth page to use solid colors only")
	}

	for _, fragment := range []string{
		`class="wizard-nav"`,
		`data-step-panel="0"`,
		`data-step-panel="1" hidden`,
		`data-step-panel="2" hidden`,
		"创建管理员密码",
		"绑定验证器",
		"确认会话策略",
		`id="next-step"`,
		`id="back-step"`,
		`id="totp-disabled-note"`,
	} {
		if !strings.Contains(page, fragment) {
			t.Fatalf("expected setup wizard page to contain %q", fragment)
		}
	}
	if strings.Contains(page, "至少 10 位") {
		t.Fatal("expected setup page to stop advertising the old ten-character minimum")
	}
	if !strings.Contains(page, "Array.from(password).length < 6") {
		t.Fatal("expected setup page to count visible password characters consistently with the backend")
	}
}
