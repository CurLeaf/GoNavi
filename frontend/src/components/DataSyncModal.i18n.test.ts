import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./DataSyncModal.tsx", import.meta.url),
  "utf8",
);

describe("DataSyncModal i18n", () => {
  it("localizes fixed workflow chrome while preserving raw table and SQL details as params", () => {
    [
      "差异分析完成",
      "确认全量覆盖",
      "全量覆盖会清空目标表数据后再插入，请确认已备份目标库。",
      "跨库迁移工作台",
      "数据同步工作台",
      "请选择需要同步的表：",
      "差异预览：",
      "SQL 已复制",
      "复制失败，请手动复制",
      "复制 SQL",
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain("useOptionalI18n()");
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.message\.analysis_complete\1\s*\)/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.modal\.full_overwrite_title\1\s*\)/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.preview\.title\1,\s*\{\s*table:\s*previewTable\s*\}\s*\)/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.preview\.message\.sql_copied\1\s*\)/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.preview\.message\.copy_failed\1\s*\)/,
    );
  });

  it("wraps backend details in localized shells without translating raw detail values", () => {
    expect(source).not.toContain(
      'message.error(res.message || "差异分析失败")',
    );
    expect(source).not.toContain(
      'message.error("差异分析失败: " + (e?.message || ""))',
    );
    expect(source).not.toContain(
      'message.error(res.message || "加载差异预览失败")',
    );

    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.message\.analysis_failed_detail\1,\s*\{\s*detail:/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.message\.preview_load_failed_detail\1,\s*\{\s*detail:/,
    );
    expect(source).toMatch(/tr\(\s*(['"])data_sync\.field\.schema\1\s*\)/);
    expect(source).toMatch(
      /t\(\s*(['"])data_sync\.message\.fetch_target_schemas_failed_detail\1,\s*\{\s*detail:/,
    );
  });

  it('localizes the next-step selection guards before loading table lists', () => {
    expect(source).not.toContain('message.error("Select connections first")');
    expect(source).not.toContain('message.error("Select source database")');
    expect(source).not.toContain('message.error("Select target database")');

    expect(source).toContain("message.error(tr('data_sync.message.select_connections_first'))");
    expect(source).toContain("message.error(tr('data_sync.message.select_source_database'))");
    expect(source).toContain("message.error(tr('data_sync.message.select_target_database'))");
  });

  it('localizes compare-entry only chrome without translating SQL preview or raw table names', () => {
    [
      "当前入口只做差异分析和预览",
      "按表比对",
      "按 SQL 结果集比对",
      "当前为“表结构比对”入口",
      "当前为“数据比对”入口",
      "生成目标表缺失字段的兼容变更 SQL",
      "正在比对",
      "比对完成",
      "比对失败",
      "当前阶段：",
      "成功比对 ",
      "分析日志",
      "返回比对",
      "行选择只影响 SQL 预览范围",
      "SQL 预览会按当前勾选的插入/更新/删除",
      "SQL 预览展示结构差异建议语句",
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.compare_entry\.workflow_help\1\s*\)/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.compare_entry\.option\.source_dataset\.table\1/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.compare_entry\.result\.running_description\1/,
    );
    expect(source).toMatch(
      /tr\(\s*(['"])data_sync\.compare_entry\.preview\.sql\.data_help\1/,
    );
  });
});
