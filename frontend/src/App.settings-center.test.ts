import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('settings center layout', () => {
  it('uses the same split navigation shell as the tool center', () => {
    expect(appSource).toContain("type SettingsCenterGroupKey = 'preferences' | 'services' | 'about';");
    expect(appSource).toContain("const [activeSettingsCenterGroupKey, setActiveSettingsCenterGroupKey] = useState<SettingsCenterGroupKey>('preferences');");
    expect(appSource).toContain("const [activeSettingsCenterPane, setActiveSettingsCenterPane] = useState<SettingsCenterPaneState | null>(null);");
    expect(appSource).toContain('style={toolCenterModalWorkspaceStyle}');
    expect(appSource).toContain('style={toolCenterModalSplitStyle}');
    expect(appSource).toContain('style={toolCenterNavPanelStyle}');
    expect(appSource).toContain('style={toolCenterNavScrollStyle}');
    expect(appSource).toContain('style={toolCenterContentPanelStyle}');
    expect(appSource).toContain('style={toolCenterDetailPanelStyle}');
    expect(appSource).toContain('style={toolCenterDetailBodyStyle}');
    expect(appSource).toContain('style={toolCenterScrollableListStyle}');
    expect(appSource).toContain("title: t('app.settings.group.preferences.title')");
    expect(appSource).toContain("title: t('app.settings.group.services.title')");
    expect(appSource).toContain("title: t('app.settings.group.about.title')");
  });

  it('moves sidebar table metadata configuration into the settings center', () => {
    expect(appSource).toContain("key: 'sidebar-metadata'");
    expect(appSource).toContain("title: t('app.settings.sidebar_metadata.title')");
    expect(appSource).toContain("description: t('app.settings.sidebar_metadata.description')");
    expect(appSource).toContain("handleOpenSettingsCenterPane('preferences', 'sidebar-metadata')");
    expect(appSource).toContain("setSidebarTableMetadataFieldSelected(");
    expect(appSource).toContain('DndContext');
    expect(appSource).toContain('SortableContext');
    expect(appSource).toContain('handleSidebarMetadataDragEnd');
    expect(appSource).toContain('sidebarTableMetadataFieldOrder');
    expect(appSource).toContain('data-sidebar-metadata-field={field}');
    expect(appSource).toContain("sidebarTableMetadataFields: DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS");
    expect(appSource).toContain("t('sidebar.v2_table_group_menu.display_table_rows')");
    expect(appSource).not.toContain("setIsLanguageModalOpen(true)");
  });
});
