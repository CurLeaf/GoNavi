import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('DefinitionViewer i18n', () => {
  it('keeps DefinitionViewer shell and validation copy localized', () => {
    const source = readFileSync(new URL('./DefinitionViewer.tsx', import.meta.url), 'utf8');

    expect(source).not.toMatch(/setError\('未找到数据库连接'|setError\('视图名称为空'|setError\('事件名称为空'|setError\('函数\/存储过程名称为空'/);
    expect(source).not.toMatch(/setError\(result\.message \|\| '查询定义失败'|setError\('查询定义失败: '/);
    expect(source).not.toMatch(/<Spin tip=\{`加载|message="加载失败"|>数据库:|>类型:/);
    expect(source).not.toMatch(/objectLabel = tab\.viewKind === 'materialized' \? '物化视图' : '视图'|objectLabel = '事件'|objectLabel = '函数\/存储过程'/);
    expect(source).not.toContain('对象修改');
    expect(source).not.toContain('刷新最新定义失败');
    expect(source).not.toContain('title: `修改${objectLabel}: ${normalizedObjectName}`');

    expect(source).toContain('definition_viewer.error.connection_not_found');
    expect(source).toContain('definition_viewer.error.view_name_empty');
    expect(source).toContain('definition_viewer.error.event_name_empty');
    expect(source).toContain('definition_viewer.error.routine_name_empty');
    expect(source).toContain('definition_viewer.error.query_failed');
    expect(source).toContain('definition_viewer.error.query_failed_detail');
    expect(source).toContain('definition_viewer.loading.view_definition');
    expect(source).toContain('definition_viewer.field.database');
    expect(source).toContain('definition_viewer.field.type');
    expect(source).toContain('definition_viewer.action.edit_object');
    expect(source).toContain('definition_viewer.warning.refresh_latest_failed');
    expect(source).toContain('definition_viewer.edit.tab_title');
  });

  it('keeps DefinitionViewer editor fallback comments localized', () => {
    const source = readFileSync(new URL('./DefinitionViewer.tsx', import.meta.url), 'utf8');

    expect(source).not.toMatch(/暂不支持该数据库类型的视图定义查看|SQLite 不支持函数\/存储过程定义管理|暂不支持该数据库类型的函数\/存储过程定义查看|暂不支持该数据库类型的事件定义查看/);
    expect(source).not.toMatch(/未找到视图定义|未找到函数\/存储过程定义|未找到事件定义|暂不支持该对象定义查看/);
    expect(source).not.toMatch(/当前数据源未返回可执行定义文本|当前数据源未返回完整 CREATE EVENT 语句|名称: |类型: /);
    expect(source).not.toMatch(/当前 Sphinx 实例|已执行多套兼容查询|返回失败信息: |unknown error/);
    expect(source).not.toContain('修改${objectLabel}');
    expect(source).not.toContain('请确认语法兼容当前数据库后执行');
    expect(source).not.toContain('当前对象定义为空，请补全');
    expect(source).not.toContain('/^\\s*--\\s*(未找到|暂不支持|当前)/');

    expect(source).toContain('definition_viewer.editor.unsupported_view_definition');
    expect(source).toContain('definition_viewer.editor.unsupported_sqlite_routine_definition');
    expect(source).toContain('definition_viewer.editor.unsupported_routine_definition');
    expect(source).toContain('definition_viewer.editor.event_definition_not_found');
    expect(source).toContain('definition_viewer.editor.sphinx.failed_message_unknown');
    expect(source).toContain('definition_viewer.edit.comment_title');
    expect(source).toContain('definition_viewer.edit.comment_compatibility');
    expect(source).toContain('definition_viewer.edit.comment_empty_definition');
  });
});
