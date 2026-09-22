package app

import (
	"strings"

	"GoNavi-Wails/internal/db"
)

// 可选驱动的组件更新分层：revision 指纹含共享实现文件，主程序升级会让已安装
// 驱动的 revision 一起变化。驱动库版本未变时降级为可选更新，不计入「需重装」。
func optionalDriverAgentRevisionStatus(driverType string, pkg installedDriverPackage, packageMetaExists bool) (bool, string, string) {
	expected := db.OptionalDriverAgentRevision(driverType)
	if strings.TrimSpace(expected) == "" || !packageMetaExists || !db.IsOptionalGoDriver(driverType) || !shouldVerifyOptionalDriverAgentRevision(driverType, pkg.Version) {
		return false, "", expected
	}
	actual := strings.TrimSpace(pkg.AgentRevision)
	if actual == expected {
		return false, "", expected
	}
	displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
	if definition, ok := resolveDriverDefinition(driverType); ok {
		displayName = resolveDriverDisplayName(definition)
	}
	if actual == "" {
		return true, localizedDriverBackendText(nil, "driver_manager.backend.status.agent_revision_update_detail", map[string]any{
			"name":     displayName,
			"expected": expected,
		}), expected
	}
	return true, localizedDriverBackendText(nil, "driver_manager.backend.status.agent_revision_update_detail_with_actual", map[string]any{
		"name":     displayName,
		"actual":   actual,
		"expected": expected,
	}), expected
}

func optionalDriverPackageUpdateStatus(definition driverDefinition, pkg installedDriverPackage, packageMetaExists bool) (needsUpdate bool, optionalUpdate bool, reason string, expected string) {
	needsUpdate, reason, expected = optionalDriverAgentRevisionStatus(definition.Type, pkg, packageMetaExists)
	if needsUpdate && !optionalDriverLibraryVersionChanged(definition, pkg) {
		needsUpdate = false
		optionalUpdate = true
		reason = localizedDriverBackendText(nil, "driver_manager.backend.status.optional_component_update_detail", nil)
	}
	if needsUpdate {
		return true, false, reason, expected
	}
	if mongoDriverNeedsLegacyCompatibilityUpdate(definition, pkg, packageMetaExists) {
		pinned := strings.TrimSpace(definition.PinnedVersion)
		installed := strings.TrimSpace(pkg.Version)
		return true, false, localizedDriverBackendText(nil, "driver_manager.backend.status.mongodb_compatibility_update_detail", map[string]any{
			"recommended": pinned,
			"installed":   installed,
		}), expected
	}
	return false, optionalUpdate, reason, expected
}

// optionalDriverLibraryVersionChanged 判断驱动库版本是否变化。
// 已安装版本缺失视为变化；与清单 pinned 或 latest 任一相同则视为未变化。
func optionalDriverLibraryVersionChanged(definition driverDefinition, pkg installedDriverPackage) bool {
	installed := normalizeVersion(strings.TrimSpace(pkg.Version))
	if installed == "" {
		return true
	}
	if pinned := normalizeVersion(strings.TrimSpace(definition.PinnedVersion)); pinned == installed {
		return false
	}
	latest := normalizeVersion(strings.TrimSpace(latestDriverVersionMap[normalizeDriverType(definition.Type)]))
	return latest != installed
}

func mongoDriverNeedsLegacyCompatibilityUpdate(definition driverDefinition, pkg installedDriverPackage, packageMetaExists bool) bool {
	if normalizeDriverType(definition.Type) != "mongodb" || !packageMetaExists {
		return false
	}
	pinned := normalizeVersion(strings.TrimSpace(definition.PinnedVersion))
	installed := normalizeVersion(strings.TrimSpace(pkg.Version))
	if pinned == "" || installed == "" {
		return false
	}
	return resolveMongoDriverMajorFromVersion(installed) == 2 && resolveMongoDriverMajorFromVersion(pinned) == 1
}
