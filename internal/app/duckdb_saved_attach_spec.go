package app

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

// duckDBSavedAttachPlan 是解析层产出：待附加描述（含 Go 侧凭据）与给用户看的合成 SQL。
// 真正 ATTACH 在驱动层执行；本结构不得把密码写进 Query。
type duckDBSavedAttachPlan struct {
	Query         string
	AttachSpecs   []db.ExternalAttachSpec
	DetachAliases []string
}

// resolveSavedConnectionForAttach 按“ID 权威、名称便利”解析保存连接：
// 先精确匹配 ID，再匹配唯一名称；重名报错并列出候选（含 ID）。
func (a *App) resolveSavedConnectionForAttach(ref string) (connection.SavedConnectionView, error) {
	trimmed := strings.TrimSpace(ref)
	if trimmed == "" {
		return connection.SavedConnectionView{}, fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.connection_not_found", map[string]any{"ref": ref}))
	}
	views, err := a.savedConnectionRepository().List()
	if err != nil {
		return connection.SavedConnectionView{}, fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.repository_unavailable", map[string]any{"detail": err.Error()}))
	}
	for _, view := range views {
		if strings.TrimSpace(view.ID) == trimmed {
			return view, nil
		}
	}
	return resolveSavedConnectionByUniqueName(a, trimmed, views)
}

func resolveSavedConnectionByUniqueName(a *App, trimmed string, views []connection.SavedConnectionView) (connection.SavedConnectionView, error) {
	var candidates []connection.SavedConnectionView
	for _, view := range views {
		if strings.TrimSpace(view.Name) == trimmed {
			candidates = append(candidates, view)
		}
	}
	switch len(candidates) {
	case 1:
		return candidates[0], nil
	case 0:
		return connection.SavedConnectionView{}, fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.connection_not_found", map[string]any{"ref": trimmed}))
	default:
		labels := make([]string, 0, len(candidates))
		for _, view := range candidates {
			labels = append(labels, fmt.Sprintf("%s（%s，ID: %s）", strings.TrimSpace(view.Name), view.Config.Type, view.ID))
		}
		return connection.SavedConnectionView{}, fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.connection_ambiguous", map[string]any{
			"ref":        trimmed,
			"count":      len(candidates),
			"candidates": strings.Join(labels, "、"),
		}))
	}
}

// buildDuckDBAttachSpec 把解析后的保存连接映射为驱动附加参数。
// 隧道连接与不支持的类型在此显式报错，绝不把凭据带给无法安全承载它们的链路。
func (a *App) buildDuckDBAttachSpec(view connection.SavedConnectionView, resolved connection.ConnectionConfig, alias string, readOnly bool) (db.ExternalAttachSpec, error) {
	name := strings.TrimSpace(view.Name)
	if err := rejectDuckDBAttachTunnel(a, name, resolved); err != nil {
		return db.ExternalAttachSpec{}, err
	}
	if !readOnly && resolved.ReadOnly {
		return db.ExternalAttachSpec{}, fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.read_write_rejected", map[string]any{"name": name}))
	}

	finalAlias := strings.TrimSpace(alias)
	if finalAlias == "" {
		finalAlias = slugifyAttachAlias(name, view.ID)
	}
	spec := db.ExternalAttachSpec{
		Alias:        finalAlias,
		ReadOnly:     readOnly,
		SecretName:   "gonavi_attach_" + finalAlias,
		ConnectionID: strings.TrimSpace(view.ID),
	}
	if err := fillDuckDBAttachSpecKind(a, name, resolved, &spec); err != nil {
		return db.ExternalAttachSpec{}, err
	}
	return spec, nil
}

func rejectDuckDBAttachTunnel(a *App, name string, resolved connection.ConnectionConfig) error {
	if resolved.UseSSH && strings.TrimSpace(resolved.SSH.Host) != "" {
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.tunnel_unsupported", map[string]any{"name": name}))
	}
	if strings.TrimSpace(resolved.Proxy.Type) != "" && strings.TrimSpace(resolved.Proxy.Host) != "" {
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.tunnel_unsupported", map[string]any{"name": name}))
	}
	if strings.TrimSpace(resolved.HTTPTunnel.Host) != "" {
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.tunnel_unsupported", map[string]any{"name": name}))
	}
	return nil
}

func fillDuckDBAttachSpecKind(a *App, name string, resolved connection.ConnectionConfig, spec *db.ExternalAttachSpec) error {
	switch strings.ToLower(strings.TrimSpace(resolved.Type)) {
	case "mysql", "mariadb":
		fillDuckDBAttachNetworkSpec(spec, db.ExternalAttachKindMySQL, resolved)
		return nil
	case "oceanbase":
		if strings.EqualFold(strings.TrimSpace(resolved.OceanBaseProtocol), "oracle") {
			return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.type_unsupported", map[string]any{"name": name, "type": resolved.Type}))
		}
		fillDuckDBAttachNetworkSpec(spec, db.ExternalAttachKindMySQL, resolved)
		return nil
	case "postgres", "kingbase", "opengauss", "gaussdb", "vastbase", "highgo":
		fillDuckDBAttachNetworkSpec(spec, db.ExternalAttachKindPostgres, resolved)
		return nil
	case "sqlite":
		return fillDuckDBAttachFileSpec(a, name, spec, db.ExternalAttachKindSQLite, resolved)
	case "duckdb":
		return fillDuckDBAttachFileSpec(a, name, spec, db.ExternalAttachKindDuckDB, resolved)
	default:
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.type_unsupported", map[string]any{"name": name, "type": resolved.Type}))
	}
}

func fillDuckDBAttachNetworkSpec(spec *db.ExternalAttachSpec, kind string, resolved connection.ConnectionConfig) {
	spec.Kind = kind
	spec.Host = strings.TrimSpace(resolved.Host)
	spec.Port = resolved.Port
	spec.User = strings.TrimSpace(resolved.User)
	spec.Password = resolved.Password
	spec.Database = strings.TrimSpace(resolved.Database)
}

func fillDuckDBAttachFileSpec(a *App, name string, spec *db.ExternalAttachSpec, kind string, resolved connection.ConnectionConfig) error {
	spec.Kind = kind
	spec.FilePath = strings.TrimSpace(firstNonEmptyString(resolved.Host, resolved.Database))
	if spec.FilePath == "" || spec.FilePath == ":memory:" {
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.sqlite_memory_unsupported", map[string]any{"name": name}))
	}
	return nil
}

// planDuckDBSavedConnectionDirectives 扫描 SQL：读已保存连接、产出待附加描述，
// 并把指令改写成不含口令的合成 SELECT。无指令时原样返回。本函数不执行 ATTACH。
func (a *App) planDuckDBSavedConnectionDirectives(query string) (duckDBSavedAttachPlan, error) {
	if !duckDBSavedConnectionDirectivePattern.MatchString(query) {
		return duckDBSavedAttachPlan{Query: query}, nil
	}
	statements := splitSQLStatementsForDialect("duckdb", query)
	if len(statements) == 0 {
		return duckDBSavedAttachPlan{Query: query}, nil
	}
	return a.buildDuckDBSavedAttachPlan(statements, query)
}

func (a *App) buildDuckDBSavedAttachPlan(statements []string, originalQuery string) (duckDBSavedAttachPlan, error) {
	plan := duckDBSavedAttachPlan{}
	rewritten := make([]string, 0, len(statements))
	directiveSeen := false
	for _, statement := range statements {
		if strings.TrimSpace(statement) == "" {
			continue
		}
		sqlText, spec, detachAlias, isDirective, err := a.planDuckDBSavedConnectionStatement(statement)
		if err != nil {
			return duckDBSavedAttachPlan{}, err
		}
		if isDirective {
			directiveSeen = true
			if spec != nil {
				plan.AttachSpecs = append(plan.AttachSpecs, *spec)
			}
			if detachAlias != "" {
				plan.DetachAliases = append(plan.DetachAliases, detachAlias)
			}
		}
		rewritten = append(rewritten, sqlText)
	}
	if !directiveSeen {
		return duckDBSavedAttachPlan{Query: originalQuery}, nil
	}
	plan.Query = strings.Join(rewritten, ";\n")
	return plan, nil
}

func (a *App) planDuckDBSavedConnectionStatement(statement string) (sqlText string, spec *db.ExternalAttachSpec, detachAlias string, isDirective bool, err error) {
	directive, parsed, parseErr := parseDuckDBSavedConnectionDirective(statement)
	if parseErr != nil {
		return "", nil, "", false, renderDuckDBAttachParseError(a, parseErr)
	}
	if !parsed {
		safe := ensureStatementSemicolonSafety(strings.TrimSuffix(strings.TrimSpace(statement), ";"))
		return safe, nil, "", false, nil
	}
	if directive.kind == duckDBAttachDirectiveKindDetach {
		message := a.appText("db.backend.info.duckdb_attach.detached", map[string]any{"alias": directive.alias})
		return duckDBAttachSyntheticSelect(message), nil, directive.alias, true, nil
	}
	built, name, buildErr := a.planDuckDBAttachSpec(directive)
	if buildErr != nil {
		return "", nil, "", true, buildErr
	}
	message := a.duckDBAttachSuccessMessage(directive, name, built.Alias)
	return duckDBAttachSyntheticSelect(message), &built, "", true, nil
}

func (a *App) planDuckDBAttachSpec(directive *duckDBAttachDirective) (db.ExternalAttachSpec, string, error) {
	view, err := a.resolveSavedConnectionForAttach(directive.ref)
	if err != nil {
		return db.ExternalAttachSpec{}, "", err
	}
	_, bundle, err := a.savedConnectionRepository().loadConnectionSnapshot(view.ID)
	if err != nil {
		return db.ExternalAttachSpec{}, "", fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.repository_unavailable", map[string]any{"detail": err.Error()}))
	}
	resolved := mergeConnectionSecretBundleIntoConfig(view.Config, bundle)
	spec, err := a.buildDuckDBAttachSpec(view, resolved, directive.alias, directive.readOnly)
	if err != nil {
		return db.ExternalAttachSpec{}, "", err
	}
	return spec, strings.TrimSpace(view.Name), nil
}

func (a *App) duckDBAttachSuccessMessage(directive *duckDBAttachDirective, name, alias string) string {
	modeKey := "db.backend.info.duckdb_attach.mode_read_only"
	if !directive.readOnly {
		modeKey = "db.backend.info.duckdb_attach.mode_read_write"
	}
	return a.appText("db.backend.info.duckdb_attach.success", map[string]any{
		"name":  name,
		"alias": alias,
		"mode":  a.appText(modeKey, nil),
	})
}
