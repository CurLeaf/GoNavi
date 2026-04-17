package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateLocalDriverPackagePathRejectsJdbcJar(t *testing.T) {
	err := validateLocalDriverPackagePath(filepath.Join("tmp", "kingbase8.JAR"))
	if err == nil {
		t.Fatal("expected JDBC jar path to be rejected")
	}
	if !strings.Contains(err.Error(), "JDBC Jar") {
		t.Fatalf("expected JDBC jar hint, got %q", err.Error())
	}
	if err := validateLocalDriverPackagePath(filepath.Join("tmp", "kingbase-driver-agent.zip")); err != nil {
		t.Fatalf("expected zip package to stay supported, got %v", err)
	}
}

func TestInstallLocalDriverPackageRejectsJdbcJarBeforeBuildChecks(t *testing.T) {
	jarPath := filepath.Join(t.TempDir(), "kingbase8.jar")
	if err := os.WriteFile(jarPath, []byte("fake-jar"), 0o644); err != nil {
		t.Fatalf("write temp jar: %v", err)
	}

	app := &App{}
	result := app.InstallLocalDriverPackage("kingbase", jarPath, t.TempDir(), "")
	if result.Success {
		t.Fatal("expected local jar import to fail")
	}
	if !strings.Contains(result.Message, "JDBC Jar") {
		t.Fatalf("expected JDBC jar guidance, got %q", result.Message)
	}
}
