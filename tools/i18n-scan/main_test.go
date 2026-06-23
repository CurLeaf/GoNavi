package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanFileFindsChineseUserFacingText(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("const title = \"设置\"\n// 注释中文忽略\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%d, want 1", len(findings))
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 1 {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileAllowsExplicitRawDomainLines(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const rawBackendMessage = 'Redis Key 不存在或已过期'; // i18n-scan: allow-raw backend sentinel\n" +
		"// i18n-scan: allow-raw product name\n" +
		"const productName = 'Dameng (达梦)';\n" +
		"const title = '设置';\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 4 || findings[0].Text != `const title = '设置';` {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileIgnoresChineseInBlockComments(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := `/* 块注释中文 */
/** 文档注释中文 */
/*
 * 多行中文注释
多行块注释中文不以星号开头
 */
const title = "设置";
const inline = "保留"; /* 行尾中文注释 */
/* 前置中文注释 */ const after = "继续保留";
const node = <div>{/* JSX 注释中文 */}</div>;
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 7, text: `const title = "设置";`},
		{line: 8, text: `const inline = "保留";`},
		{line: 9, text: `const after = "继续保留";`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "frontend/src/demo.tsx" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFilePreservesCommentMarkersInsideStrings(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const marker = \"/*\";\n" +
		"const title = \"设置\";\n" +
		"const literal = \"/* 设置 */\";\n" +
		"const template = `/* 模板 */`;\n" +
		"const single = '/* 单引号 */';\n" +
		"/* 注释中文 */\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 2, text: `const title = "设置";`},
		{line: 3, text: `const literal = "/* 设置 */";`},
		{line: 4, text: "const template = `/* 模板 */`;"},
		{line: 5, text: `const single = '/* 单引号 */';`},
		{line: 7, text: `const after = "继续保留";`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "frontend/src/demo.tsx" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFilePreservesStandaloneBlockMarkersInsideGoRawStrings(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "internal", "app", "demo.go")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "package app\n\n" +
		"var raw = `\n" +
		"/* 原始字符串中文应保留 */\n" +
		"`\n" +
		"var after = \"继续保留\"\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 4, text: `/* 原始字符串中文应保留 */`},
		{line: 6, text: `var after = "继续保留"`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "internal/app/demo.go" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFilePreservesStandaloneBlockMarkersInsidePlainTemplate(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const message = `\n" +
		"/* 普通模板中文应保留 */\n" +
		"`;\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 2, text: `/* 普通模板中文应保留 */`},
		{line: 4, text: `const after = "继续保留";`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "frontend/src/demo.tsx" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFilePreservesStandaloneBlockMarkersInsideStyleNamedPlainTemplate(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const styleMessage = `\n" +
		"/* 用户可见中文 */\n" +
		"`;\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 2, text: `/* 用户可见中文 */`},
		{line: 4, text: `const after = "继续保留";`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "frontend/src/demo.tsx" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFilePreservesStandaloneBlockMarkersInsideStyleSuffixPlainTemplate(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const messageStyle = `\n" +
		"/* 用户可见中文 */\n" +
		"`;\n" +
		"const messageCss = `\n" +
		"/* CSS 后缀普通模板中文 */\n" +
		"`;\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		line int
		text string
	}{
		{line: 2, text: `/* 用户可见中文 */`},
		{line: 5, text: `/* CSS 后缀普通模板中文 */`},
		{line: 7, text: `const after = "继续保留";`},
	}
	if len(findings) != len(want) {
		t.Fatalf("findings=%#v, want %d", findings, len(want))
	}
	for i, item := range findings {
		if item.Path != "frontend/src/demo.tsx" || item.Line != want[i].line || item.Text != want[i].text {
			t.Fatalf("findings[%d]=%#v, want line=%d text=%q", i, item, want[i].line, want[i].text)
		}
	}
}

func TestScanFileLineCommentBacktickDoesNotLeakIntoBlockComments(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "// 行注释里有未闭合反引号 `\n" +
		"/** 文档注释中文应忽略 */\n" +
		"const title = \"设置\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 3 || findings[0].Text != `const title = "设置";` {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileInlineStyleTemplateDoesNotLeakIntoJSXComments(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const view = <div style={{ border: `1px solid ${cardBorder}` }} />;\n" +
		"{/* JSX 注释中文应忽略 */}\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 3 || findings[0].Text != `const after = "继续保留";` {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileRegexBacktickDoesNotLeakIntoJSDoc(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const escaped = String(name).replace(/`/g, '``');\n" +
		"/** JSDoc 中文应忽略 */\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 3 || findings[0].Text != `const after = "继续保留";` {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileRegexBacktickInsideLiteralDoesNotLeakIntoJSDoc(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const matcher = /foo`bar/g;\n" +
		"/** JSDoc 中文应忽略 */\n" +
		"const after = \"继续保留\";\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 3 || findings[0].Text != `const after = "继续保留";` {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}

func TestScanFileIgnoresCssBlockCommentInMultilineTemplate(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "frontend", "src", "demo.tsx")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "const gridCssText = useMemo(() => `\n" +
		"/* CSS 注释中文应忽略 */\n" +
		".selector { color: red; }\n" +
		".selected { color: ${darkMode ? `red` : `blue`}; }\n" +
		"/* 多行 CSS 注释中文应忽略，\n" +
		"   第二行中文也应忽略 */\n" +
		".rule { display: block; }\n" +
		"`, []);\n" +
		"const template = `/* 模板 */`;\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	findings, err := scanFile(root, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings=%#v, want 1", findings)
	}
	if findings[0].Path != "frontend/src/demo.tsx" || findings[0].Line != 9 || findings[0].Text != "const template = `/* 模板 */`;" {
		t.Fatalf("unexpected finding: %#v", findings[0])
	}
}
