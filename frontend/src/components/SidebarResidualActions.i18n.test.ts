import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const objectActionsSource = readFileSync(new URL('./sidebar/useSidebarObjectActions.tsx', import.meta.url), 'utf8');
const legacyMenuSource = readFileSync(new URL('./sidebar/sidebarLegacyNodeMenu.tsx', import.meta.url), 'utf8');
const v2ActionHandlersSource = readFileSync(new URL('./sidebar/useSidebarV2ActionHandlers.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;

const requiredKeys = [
  'sidebar.message.saved_query_rename_failed',
  'sidebar.message.saved_query_rebind_success',
  'sidebar.message.saved_query_rebind_failed',
  'sidebar.message.message_publish_unsupported',
  'sidebar.message.message_publish_success',
  'sidebar.message.message_publish_success_with_count',
  'sidebar.message.message_publish_target_fallback',
  'sidebar.message.connection_release_failed',
  'sidebar.message.connection_release_failed_from_sidebar',
  'sidebar.menu.new_table',
  'sidebar.menu.create_event',
  'sidebar.tab.new_event',
  'sidebar.modal.confirm_delete_tag.content',
  'sidebar.menu.bind_to_connection',
  'sidebar.message.saved_query_delete_failed',
  'sidebar.message.database_created',
  'sidebar.message.operation_create_failed',
  'sidebar.aria.switch_connection',
];

describe('Sidebar residual actions i18n', () => {
  it('localizes saved-query, message publish, tag, and residual group-menu copy', () => {
    [
      '重命名查询失败: ',
      '查询已绑定到 ',
      '绑定查询失败: ',
      '数据库创建成功',
      '创建失败: ',
      '当前对象不支持测试发送消息',
      '（已提交 ',
      '测试消息已发送到 ',
      "destination || '目标'",
    ].forEach((legacyCopy) => {
      expect(objectActionsSource).not.toContain(legacyCopy);
    });

    [
      "'释放连接失败'",
      '连接已从侧边栏断开，但后端连接释放失败',
    ].forEach((legacyCopy) => {
      expect(v2ActionHandlersSource).not.toContain(legacyCopy);
    });

    [
      "label: '刷新'",
      "label: '新建表'",
      "label: '按名称排序'",
      "label: '按使用频率排序'",
      "label: '新建事件'",
      "title: '新建事件'",
      "label: '编辑标签'",
      "label: '删除标签'",
      "title: '确认删除'",
      '确定要删除标签',
      "label: '绑定到连接'",
      '删除查询失败: ',
    ].forEach((legacyCopy) => {
      expect(legacyMenuSource).not.toContain(legacyCopy);
    });

    [
      'sidebar.message.saved_query_rename_failed',
      'sidebar.message.saved_query_rebind_success',
      'sidebar.message.saved_query_rebind_failed',
      'sidebar.message.database_created',
      'sidebar.message.operation_create_failed',
      'sidebar.message.message_publish_unsupported',
      'sidebar.message.message_publish_success',
      'sidebar.message.message_publish_success_with_count',
      'sidebar.message.message_publish_target_fallback',
    ].forEach((key) => {
      expect(objectActionsSource).toContain(`t('${key}'`);
    });

    [
      'sidebar.message.connection_release_failed_from_sidebar',
      'sidebar.menu.new_table',
      'sidebar.menu.create_event',
      'sidebar.tab.new_event',
      'sidebar.modal.confirm_delete_tag.content',
      'sidebar.menu.bind_to_connection',
      'sidebar.message.saved_query_delete_failed',
    ].forEach((key) => {
      expect(`${legacyMenuSource}\n${v2ActionHandlersSource}`).toContain(`t('${key}'`);
    });

    [
      'sidebar.message.connection_release_failed_from_sidebar',
    ].forEach((key) => {
      expect(v2ActionHandlersSource).toContain(`t('${key}'`);
    });

    expect(legacyMenuSource).toContain("label: conn.name || conn.id");
    expect(legacyMenuSource).toContain('node.title');
  });

  it('keeps residual Sidebar keys available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
