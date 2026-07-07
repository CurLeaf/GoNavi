package app

import (
	"io"
	"os"
	"path/filepath"
	stdRuntime "runtime"
	"strconv"
	"strings"

	"GoNavi-Wails/internal/logger"
)

func init() {
	updateLaunchInstallScript = launchUpdateScriptWithCleanup
}

func launchUpdateScriptWithCleanup(staged *stagedUpdate) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, _ = filepath.EvalSymlinks(exePath)
	pid := os.Getpid()

	if stdRuntime.GOOS == "windows" {
		return launchWindowsUpdateWithCleanup(staged, exePath, pid)
	}
	return launchUpdateScript(staged)
}

func launchWindowsUpdateWithCleanup(staged *stagedUpdate, targetExe string, pid int) error {
	if staged == nil {
		return localizedUpdateError{key: "app.update.backend.message.no_downloaded_package"}
	}
	if err := os.MkdirAll(staged.StagedDir, 0o755); err != nil {
		return err
	}

	currentTargetExe := strings.TrimSpace(targetExe)
	originalSourceDir := strings.TrimSpace(filepath.Dir(staged.FilePath))
	preparedSource, err := prepareWindowsStagedUpdateAsset(staged.FilePath, staged.StagedDir)
	if err != nil {
		return err
	}
	staged.FilePath = preparedSource
	staged.InstallLogPath = buildUpdateInstallLogPath(staged.StagedDir)
	finalTargetExe := resolveWindowsUpdateFinalTargetPath(currentTargetExe, staged.FilePath)

	cleanupWindowsUpdateArtifacts([]string{
		originalSourceDir,
		strings.TrimSpace(filepath.Dir(currentTargetExe)),
		strings.TrimSpace(filepath.Dir(finalTargetExe)),
	}, map[string]struct{}{
		cleanComparablePath(currentTargetExe): {},
		cleanComparablePath(finalTargetExe):   {},
		cleanComparablePath(staged.FilePath):  {},
		cleanComparablePath(staged.StagedDir): {},
	})

	scriptPath := filepath.Join(staged.StagedDir, "update.cmd")
	content := buildWindowsScriptWithCleanup(staged.FilePath, finalTargetExe, currentTargetExe, staged.StagedDir, staged.InstallLogPath, pid)
	if err := os.WriteFile(scriptPath, []byte(content), 0o644); err != nil {
		return err
	}

	logger.Infof("启动 Windows 更新脚本：current=%s target=%s script=%s log=%s", currentTargetExe, finalTargetExe, scriptPath, staged.InstallLogPath)
	cmd := buildWindowsLaunchCommand(scriptPath)
	if err := cmd.Start(); err != nil {
		return err
	}
	if cmd.Process != nil {
		if err := cmd.Process.Release(); err != nil {
			logger.Warnf("释放 Windows 更新脚本进程句柄失败：%v", err)
		}
	}
	return nil
}

func resolveWindowsUpdateFinalTargetPath(currentTarget string, sourcePath string) string {
	currentTarget = strings.TrimSpace(currentTarget)
	if currentTarget == "" {
		return currentTarget
	}
	currentName := filepath.Base(currentTarget)
	sourceName := filepath.Base(strings.TrimSpace(sourcePath))
	if isVersionedWindowsUpdatePackageName(currentName) && isVersionedWindowsUpdatePackageName(sourceName) {
		return filepath.Join(filepath.Dir(currentTarget), sourceName)
	}
	return currentTarget
}

func isVersionedWindowsUpdatePackageName(name string) bool {
	trimmed := strings.TrimSpace(name)
	lower := strings.ToLower(trimmed)
	return strings.HasPrefix(trimmed, "GoNavi-")
		&& strings.Contains(trimmed, "-Windows-")
		&& strings.HasSuffix(lower, ".exe")
}

func prepareWindowsStagedUpdateAsset(sourcePath string, stagedDir string) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	stagedDir = strings.TrimSpace(stagedDir)
	if sourcePath == "" || stagedDir == "" {
		return sourcePath, nil
	}
	if isUpdateAssetPathInsideStagedDir(sourcePath, stagedDir) {
		return sourcePath, nil
	}
	if err := os.MkdirAll(stagedDir, 0o755); err != nil {
		return "", err
	}
	targetPath := filepath.Join(stagedDir, filepath.Base(sourcePath))
	if cleanComparablePath(sourcePath) == cleanComparablePath(targetPath) {
		return sourcePath, nil
	}
	_ = os.Remove(targetPath)
	if err := os.Rename(sourcePath, targetPath); err == nil {
		return targetPath, nil
	}
	if err := copyFileForWindowsUpdate(sourcePath, targetPath); err != nil {
		return "", err
	}
	_ = os.Remove(sourcePath)
	return targetPath, nil
}

func copyFileForWindowsUpdate(sourcePath string, targetPath string) error {
	in, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func cleanupWindowsUpdateArtifacts(dirs []string, keep map[string]struct{}) {
	seen := map[string]struct{}{}
	for _, dir := range dirs {
		dir = strings.TrimSpace(dir)
		if dir == "" || dir == "." {
			continue
		}
		cleanDir := cleanComparablePath(dir)
		if cleanDir == "" {
			continue
		}
		if _, ok := seen[cleanDir]; ok {
			continue
		}
		seen[cleanDir] = struct{}{}
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			path := filepath.Join(dir, entry.Name())
			cleanPath := cleanComparablePath(path)
			if cleanPath == "" {
				continue
			}
			if _, ok := keep[cleanPath]; ok {
				continue
			}
			if shouldRemoveWindowsUpdateArtifact(entry.Name(), entry.IsDir()) {
				if entry.IsDir() {
					_ = os.RemoveAll(path)
				} else {
					_ = os.Remove(path)
				}
			}
		}
	}
}

func shouldRemoveWindowsUpdateArtifact(name string, isDir bool) bool {
	trimmed := strings.TrimSpace(name)
	lower := strings.ToLower(trimmed)
	if trimmed == "" {
		return false
	}
	if isDir {
		return strings.HasPrefix(lower, ".gonavi-update-")
	}
	if strings.HasPrefix(lower, "gonavi-update-") && strings.HasSuffix(lower, ".log") {
		return true
	}
	if !strings.HasPrefix(trimmed, "GoNavi-") {
		return false
	}
	if !strings.Contains(trimmed, "-Windows-") {
		return false
	}
	return strings.HasSuffix(lower, ".exe") || strings.HasSuffix(lower, ".zip")
}

func cleanComparablePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	cleaned := filepath.Clean(path)
	if cleaned == "." {
		return ""
	}
	if stdRuntime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}
	return cleaned
}

func buildWindowsScriptWithCleanup(source, target, currentTarget, stagedDir, logPath string, pid int) string {
	script := `@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SOURCE=__GONAVI_UPDATE_SOURCE__"
set "TARGET=__GONAVI_UPDATE_TARGET__"
set "CURRENT_TARGET=__GONAVI_CURRENT_TARGET__"
set "TARGET_OLD=%TARGET%.old"
set "STAGED=__GONAVI_UPDATE_STAGED__"
set "LOG_FILE=__GONAVI_UPDATE_LOG__"
set PID=__GONAVI_UPDATE_PID__
set /a WAIT_PID_SECONDS=0

call :log updater started
if not exist "%SOURCE%" (
  call :log source file not found: %SOURCE%
  exit /b 1
)

for %%I in ("%TARGET%") do set "TARGET_NAME=%%~nxI"
for %%I in ("%TARGET%") do set "TARGET_DIR=%%~dpI"
for %%I in ("%SOURCE%") do set "SOURCE_EXT=%%~xI"
set "SOURCE_EXE="

if /I "%SOURCE_EXT%"==".zip" (
  set "EXTRACT_DIR=%STAGED%\_extract"
  if exist "%EXTRACT_DIR%" (
    rmdir /S /Q "%EXTRACT_DIR%" >> "%LOG_FILE%" 2>&1
  )
  mkdir "%EXTRACT_DIR%" >> "%LOG_FILE%" 2>&1
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$src=$env:SOURCE; $dst=$env:EXTRACT_DIR; Expand-Archive -LiteralPath $src -DestinationPath $dst -Force" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL! NEQ 0 (
    call :log expand zip failed: %SOURCE%
    exit /b 1
  )
  if exist "%EXTRACT_DIR%\%TARGET_NAME%" (
    set "SOURCE_EXE=%EXTRACT_DIR%\%TARGET_NAME%"
  ) else (
    for /R "%EXTRACT_DIR%" %%F in (*.exe) do (
      if not defined SOURCE_EXE (
        set "SOURCE_EXE=%%~fF"
      )
    )
  )
  if not defined SOURCE_EXE (
    call :log no executable found in portable zip: %SOURCE%
    exit /b 1
  )
) else (
  set "SOURCE_EXE=%SOURCE%"
)

:waitloop
tasklist /FI "PID eq %PID%" | find "%PID%" >nul
if %ERRORLEVEL%==0 (
  if !WAIT_PID_SECONDS! GEQ 90 (
    call :log host process still running after !WAIT_PID_SECONDS! seconds, aborting update
    exit /b 1
  )
  timeout /t 1 /nobreak >nul
  set /a WAIT_PID_SECONDS+=1
  goto waitloop
)
call :log host process exited

timeout /t 3 /nobreak >nul
call :log cooldown finished, starting file replace

:replace_binary
if /I "%SOURCE_EXE%"=="%TARGET%" (
  call :log downloaded executable already at target path, skip replace
  goto move_done
)
set /a RETRY=0
:move_retry
call :log attempt !RETRY!: trying rename-then-copy strategy
move /Y "%TARGET%" "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
if !ERRORLEVEL!==0 (
  copy /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL!==0 (
    del /F /Q "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
    goto move_done
  )
  call :log copy after rename failed, restoring old file
  move /Y "%TARGET_OLD%" "%TARGET%" >> "%LOG_FILE%" 2>&1
)

call :log rename strategy failed, trying direct move
move /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL%==0 goto move_done

copy /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL%==0 goto move_done

set /a RETRY+=1
if !RETRY! LSS 15 (
  set /a WAIT=1
  if !RETRY! GEQ 3 set /a WAIT=2
  if !RETRY! GEQ 6 set /a WAIT=3
  if !RETRY! GEQ 9 set /a WAIT=5
  call :log waiting !WAIT! seconds before retry
  timeout /t !WAIT! /nobreak >nul
  goto move_retry
)

call :log replace failed after retries (portable mode, no elevation): check directory write permission or file lock
exit /b 1

:move_done
del /F /Q "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
if /I not "%CURRENT_TARGET%"=="%TARGET%" (
  if exist "%CURRENT_TARGET%" del /F /Q "%CURRENT_TARGET%" >> "%LOG_FILE%" 2>&1
)
if exist "%SOURCE%" del /F /Q "%SOURCE%" >> "%LOG_FILE%" 2>&1
start "" /D "%TARGET_DIR%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  call :log cmd start failed, trying powershell Start-Process
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%TARGET%' -WorkingDirectory '%TARGET_DIR%'" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL! NEQ 0 (
    call :log relaunch failed
    exit /b 1
  )
)
call :log update finished
start "" /MIN cmd.exe /D /C "timeout /t 2 /nobreak >nul & del /F /Q ""%LOG_FILE%"" >nul 2>&1 & rmdir /S /Q ""%STAGED%"" >nul 2>&1"
exit /b 0

:log
echo [%date% %time%] %*>>"%LOG_FILE%"
exit /b 0
`
	return strings.NewReplacer(
		"__GONAVI_UPDATE_SOURCE__", source,
		"__GONAVI_UPDATE_TARGET__", target,
		"__GONAVI_CURRENT_TARGET__", currentTarget,
		"__GONAVI_UPDATE_STAGED__", stagedDir,
		"__GONAVI_UPDATE_LOG__", logPath,
		"__GONAVI_UPDATE_PID__", strconv.Itoa(pid),
	).Replace(strings.ReplaceAll(script, "\n", "\r\n"))
}
