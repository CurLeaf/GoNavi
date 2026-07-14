import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { buildConnectionTagParentOptions } from './sidebar/SidebarEntityModals';
import { buildSidebarLegacyNodeMenuItems } from './sidebar/sidebarLegacyNodeMenu';

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const modalSource = readFileSync(new URL('./sidebar/SidebarEntityModals.tsx', import.meta.url), 'utf8');
const legacyMenuSource = readFileSync(new URL('./sidebar/sidebarLegacyNodeMenu.tsx', import.meta.url), 'utf8');
const v2MenuSource = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');
const v2HandlerSource = readFileSync(new URL('./sidebar/useSidebarV2ActionHandlers.tsx', import.meta.url), 'utf8');

describe('Sidebar nested group menu', () => {
  it('does not offer a group itself or its descendants as an editable parent', () => {
    const options = buildConnectionTagParentOptions([
      { id: 'root', name: 'Root', connectionIds: [] },
      { id: 'child', name: 'Child', parentTagId: 'root', connectionIds: [] },
      { id: 'grandchild', name: 'Grandchild', parentTagId: 'child', connectionIds: [] },
      { id: 'other', name: 'Other', connectionIds: [] },
    ], 'root');

    expect(options).toEqual([{ value: 'other', label: 'Other' }]);
  });

  it('preselects the clicked legacy group when creating a child group', () => {
    const createTagForm = {
      resetFields: vi.fn(),
      setFieldsValue: vi.fn(),
    };
    const setRenameViewTarget = vi.fn();
    const setIsCreateTagModalOpen = vi.fn();
    const node = {
      type: 'tag',
      title: 'Group 1',
      dataRef: {
        id: 'group-1',
        name: 'Group 1',
        parentTagId: 'root',
        connectionIds: ['host-1'],
        childOrder: ['connection:host-1'],
      },
    };
    const items = buildSidebarLegacyNodeMenuItems(node, {
      createTagForm,
      setRenameViewTarget,
      setIsCreateTagModalOpen,
      removeConnectionTag: vi.fn(),
    });
    const newChildItem = (items || []).find((item: any) => item?.key === 'new-child-tag') as any;
    const editItem = (items || []).find((item: any) => item?.key === 'edit-tag') as any;

    newChildItem.onClick();
    expect(createTagForm.resetFields).toHaveBeenCalledOnce();
    expect(createTagForm.setFieldsValue).toHaveBeenLastCalledWith({
      parentTagId: 'group-1',
      connectionIds: [],
    });
    expect(setRenameViewTarget).toHaveBeenLastCalledWith(null);
    expect(setIsCreateTagModalOpen).toHaveBeenLastCalledWith(true);

    editItem.onClick();
    expect(createTagForm.setFieldsValue).toHaveBeenLastCalledWith({
      name: 'Group 1',
      parentTagId: 'root',
      connectionIds: ['host-1'],
    });
  });

  it('keeps modal and both menu implementations aligned with nested grouping', () => {
    expect(modalSource).toContain('name="parentTagId"');
    expect(modalSource).toContain('parentTagId,');
    expect(legacyMenuSource).toContain("key: 'new-child-tag'");
    expect(legacyMenuSource).toContain("t('connection.sidebar.group.newSubgroup')");
    expect(v2MenuSource).toContain("| 'new-subgroup'");
    expect(v2MenuSource).toContain("action: 'new-subgroup'");
    expect(v2HandlerSource).toContain("if (action === 'new-subgroup')");
  });

  it('ships nested-group labels and deletion behavior in every locale', () => {
    [
      'connection.sidebar.group.newSubgroup',
      'sidebar.field.parent_group',
      'sidebar.placeholder.parent_group',
      'connection.sidebar.group.deleteConfirmContent',
      'sidebar.modal.confirm_delete_tag.content',
    ].forEach((key) => {
      locales.forEach((locale) => {
        const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
