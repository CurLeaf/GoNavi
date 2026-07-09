package app

import (
	"strings"
	"testing"
)

func TestBuildMacScriptContainsHardeningGuards(t *testing.T) {
	script := buildMacScript(
		"/tmp/GoNavi-1.2.3-MacOS-Arm64.dmg",
		"/Applications/GoNavi.app",
		"/tmp/stage",
		"/tmp/stage/mnt",
		"/tmp/gonavi-update-macos.log",
		4242,
	)

	mustContain := []string{
		"MAX_WAIT_PID_SECONDS=120",
		"hdiutil attach",
		"prepare_app_source_from_package",
		"resolve_app_binary_rel",
		"replace_app_direct",
		"run_admin_replace",
		"relaunch_app",
		"open -n -a",
		// 安装包扩展名分支
		"dmg)",
		"zip)",
		// 不要在脚本运行中 rm -rf 整个 STAGED（脚本自身所在目录）
		`/bin/rm -f "$PACKAGE"`,
	}
	for _, token := range mustContain {
		if !strings.Contains(script, token) {
			t.Fatalf("mac update script missing required token %q\nscript:\n%s", token, script)
		}
	}
	if strings.Contains(script, `rm -rf "$MOUNT_DIR" "$DMG" "$STAGED"`) {
		t.Fatal("mac update script must not delete STAGED while the script may still be running from it")
	}
	if !strings.Contains(script, "/tmp/GoNavi-1.2.3-MacOS-Arm64.dmg") {
		t.Fatal("expected package path embedded in script")
	}
	if !strings.Contains(script, "/Applications/GoNavi.app") {
		t.Fatal("expected target app path embedded in script")
	}
	if !strings.Contains(script, "PID=4242") {
		t.Fatal("expected host pid embedded in script")
	}
}

func TestResolveMacUpdateTargetFallsBackFromAppTranslocation(t *testing.T) {
	got := resolveMacUpdateTarget("/private/var/folders/xx/AppTranslocation/ABC/d/GoNavi.app/Contents/MacOS/GoNavi")
	if got != "/Applications/GoNavi.app" {
		t.Fatalf("expected AppTranslocation fallback, got %q", got)
	}
	got = resolveMacUpdateTarget("/Applications/GoNavi.app/Contents/MacOS/GoNavi")
	if got != "/Applications/GoNavi.app" {
		t.Fatalf("expected normal app bundle path, got %q", got)
	}
}
