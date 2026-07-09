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
		`open -n "$TARGET_APP"`,
		// 安装包扩展名分支
		"dmg)",
		"zip)",
		// relaunch 成功后再删安装包，失败则保留
		"package kept for manual install",
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
	// 确保不会在 relaunch 之前无条件删除安装包
	rmIdx := strings.Index(script, `/bin/rm -f "$PACKAGE"`)
	relaunchIdx := strings.Index(script, "if ! relaunch_app; then")
	if rmIdx < 0 || relaunchIdx < 0 || rmIdx < relaunchIdx {
		t.Fatalf("package cleanup must happen only after relaunch attempt (rmIdx=%d relaunchIdx=%d)", rmIdx, relaunchIdx)
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
