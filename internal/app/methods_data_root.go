package app

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	stdRuntime "runtime"
	"strings"

	"GoNavi-Wails/internal/appdata"
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var migratableDataRootEntries = []string{
	"connections.json",
	"global_proxy.json",
	"ai_config.json",
	"sessions",
	"drivers",
}

func (a *App) GetDataRootDirectoryInfo() connection.QueryResult {
	return connection.QueryResult{Success: true, Message: "OK", Data: dataRootInfoPayload(a.configDir)}
}

func (a *App) SelectDataRootDirectory(currentDir string) connection.QueryResult {
	defaultDir := strings.TrimSpace(currentDir)
	if defaultDir == "" {
		defaultDir = appdata.MustResolveActiveRoot()
	}
	if !filepath.IsAbs(defaultDir) {
		if abs, err := filepath.Abs(defaultDir); err == nil {
			defaultDir = abs
		}
	}

	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "选择 GoNavi 数据目录",
		DefaultDirectory:     defaultDir,
		CanCreateDirectories: true,
	})
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if strings.TrimSpace(selection) == "" {
		return connection.QueryResult{Success: false, Message: "已取消"}
	}
	resolved, err := appdata.ResolveRoot(selection)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: dataRootInfoPayload(resolved)}
}

func (a *App) ApplyDataRootDirectory(directory string, migrate bool) connection.QueryResult {
	currentRoot := appdata.MustResolveActiveRoot()
	targetRoot, err := appdata.ResolveRoot(directory)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if filepath.Clean(currentRoot) == filepath.Clean(targetRoot) {
		a.configDir = targetRoot
		db.SetExternalDriverDownloadDirectory(appdata.DriverRoot(targetRoot))
		return connection.QueryResult{
			Success: true,
			Message: "数据目录未发生变化",
			Data:    dataRootInfoPayload(targetRoot),
		}
	}

	if migrate {
		if err := migrateDataRootContents(currentRoot, targetRoot); err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
	}

	appliedRoot, err := appdata.SetActiveRoot(targetRoot)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	a.configDir = appliedRoot
	db.SetExternalDriverDownloadDirectory(appdata.DriverRoot(appliedRoot))
	message := "数据目录已更新，建议重启应用以让 AI 与其他运行态模块完全切换到新目录"
	if migrate {
		message = "数据已迁移并切换到新目录，建议重启应用以完成全部模块切换"
	}
	return connection.QueryResult{Success: true, Message: message, Data: dataRootInfoPayload(appliedRoot)}
}

func (a *App) OpenDataRootDirectory() connection.QueryResult {
	root := appdata.MustResolveActiveRoot()
	if stat, err := os.Stat(root); err != nil || !stat.IsDir() {
		return connection.QueryResult{Success: false, Message: "数据目录不存在或不可访问"}
	}
	var cmd *exec.Cmd
	switch stdRuntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", root)
	case "windows":
		cmd = exec.Command("explorer", root)
	case "linux":
		cmd = exec.Command("xdg-open", root)
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前平台暂不支持打开目录：%s", stdRuntime.GOOS)}
	}
	if err := cmd.Start(); err != nil {
		logger.Error(err, "打开数据目录失败")
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("打开数据目录失败：%v", err)}
	}
	return connection.QueryResult{Success: true, Message: "已打开数据目录", Data: dataRootInfoPayload(root)}
}

func migrateDataRootContents(sourceRoot string, targetRoot string) error {
	sourceRoot = strings.TrimSpace(sourceRoot)
	targetRoot = strings.TrimSpace(targetRoot)
	if sourceRoot == "" || targetRoot == "" {
		return fmt.Errorf("数据目录不能为空")
	}
	if filepath.Clean(sourceRoot) == filepath.Clean(targetRoot) {
		return nil
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		return fmt.Errorf("创建目标数据目录失败：%w", err)
	}
	for _, name := range migratableDataRootEntries {
		sourcePath := filepath.Join(sourceRoot, name)
		info, err := os.Stat(sourcePath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return fmt.Errorf("读取源数据失败（%s）：%w", name, err)
		}
		targetPath := filepath.Join(targetRoot, name)
		if info.IsDir() {
			if err := copyDir(sourcePath, targetPath); err != nil {
				return fmt.Errorf("迁移目录失败（%s）：%w", name, err)
			}
			continue
		}
		if err := copyFile(sourcePath, targetPath, info.Mode()); err != nil {
			return fmt.Errorf("迁移文件失败（%s）：%w", name, err)
		}
	}
	return nil
}

func copyDir(sourceDir string, targetDir string) error {
	return filepath.WalkDir(sourceDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relativePath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(targetDir, relativePath)
		if entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			return os.MkdirAll(targetPath, info.Mode())
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return copyFile(path, targetPath, info.Mode())
	})
}

func copyFile(sourcePath string, targetPath string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	targetFile, err := os.Create(targetPath)
	if err != nil {
		return err
	}
	defer targetFile.Close()

	if _, err := io.Copy(targetFile, sourceFile); err != nil {
		return err
	}
	return os.Chmod(targetPath, mode)
}
