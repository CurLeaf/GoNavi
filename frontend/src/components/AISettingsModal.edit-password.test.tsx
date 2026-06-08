import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AISettingsModal.tsx', import.meta.url), 'utf8');
const aiChatPanelCss = readFileSync(new URL('./AIChatPanel.css', import.meta.url), 'utf8');

describe('AISettingsModal edit password behavior', () => {
  it('loads editable provider details before opening the edit modal', () => {
    expect(source).toContain("typeof Service?.AIGetEditableProvider === 'function'");
    expect(source).toContain('await Service.AIGetEditableProvider(p.id)');
  });

  it('loads and saves user-level custom prompts through the AI service', () => {
    expect(source).toContain("callOrFallback(() => Service.AIGetUserPromptSettings?.(), EMPTY_AI_USER_PROMPT_SETTINGS)");
    expect(source).toContain('await Service?.AISaveUserPromptSettings?.(payload);');
    expect(source).toContain("window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'))");
    expect(source).toContain("import AISettingsPromptsSection from './ai/AISettingsPromptsSection';");
    expect(source).toContain('<AISettingsPromptsSection');
  });

  it('loads MCP servers and skills through the AI service', () => {
    expect(source).toContain('Service.AIGetMCPClientInstallStatuses?.()');
    expect(source).toContain('Service.AIGetMCPServers?.()');
    expect(source).toContain('Service.AIListMCPTools?.()');
    expect(source).toContain('Service.AIGetSkills?.()');
    expect(source).toContain("import AISettingsSkillsSection from './ai/AISettingsSkillsSection';");
    expect(source).toContain('<AISettingsSkillsSection');
  });

  it('delegates bulky MCP and built-in tool sections to dedicated ai components', () => {
    expect(source).toContain("import AIBuiltinToolsCatalog from './ai/AIBuiltinToolsCatalog';");
    expect(source).toContain("import AISettingsSidebar, { type AISettingsSectionKey } from './ai/AISettingsSidebar';");
    expect(source).toContain("import AISettingsSafetySection from './ai/AISettingsSafetySection';");
    expect(source).toContain("import AISettingsContextSection from './ai/AISettingsContextSection';");
    expect(source).toContain("import AISettingsMCPSection, { type MCPClientKey } from './ai/AISettingsMCPSection';");
    expect(source).toContain('<AISettingsSidebar');
    expect(source).toContain('<AISettingsSafetySection');
    expect(source).toContain('<AISettingsContextSection');
    expect(source).toContain('<AISettingsMCPSection');
    expect(source).toContain('<AIBuiltinToolsCatalog');
  });

  it('wires the external MCP client install panel actions back to the modal handlers', () => {
    expect(source).toContain('mcpClientStatuses={mcpClientStatuses}');
    expect(source).toContain('selectedMCPClient={selectedMCPClient}');
    expect(source).toContain('onRefreshStatus={() => void loadMCPClientStatuses()}');
    expect(source).toContain('onCopyConfigPath={() => void handleCopySelectedMCPConfigPath()}');
    expect(source).toContain('onCopyLaunchCommand={() => void handleCopySelectedMCPLaunchCommand()}');
    expect(source).toContain('onInstallSelectedClient={handleInstallSelectedMCPClient}');
  });

  it('waits briefly for the AI service bridge before warning and removes noisy provider debug logs', () => {
    expect(source).toContain('const resolveAIService = useCallback(async () => {');
    expect(source).toContain('const service = await waitForAIService();');
    expect(source).not.toContain("console.log('[AI] AIGetProviders result:'");
    expect(source).not.toContain("console.log('[AI] AIGetActiveProvider result:'");
  });

  it('keeps the prefilled api key masked by default', () => {
    expect(source).toContain('const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);');
    expect(source).toContain('visible: primaryPasswordVisible,');
  });

  it('does not render the clear helper block anymore', () => {
    expect(source).not.toContain('当前已保存 API Key。留空表示继续沿用，输入新值表示替换。');
    expect(source).not.toContain('清除已保存 API Key');
    expect(source).not.toContain('留空表示继续沿用已保存密钥');
  });

  it('renders in-modal test errors through the local message host', () => {
    expect(source).toContain('antdMessage.useMessage({ getContainer: () => modalBodyRef.current || document.body })');
    expect(source).toContain("void messageApi.error(`测试失败: ${res?.message || '未知错误'}`);");
  });

  it('keeps long ai settings toast errors wrapped within the modal body', () => {
    expect(aiChatPanelCss).toContain('.ai-settings-body .ant-message {');
    expect(aiChatPanelCss).toContain('width: min(100%, 720px);');
    expect(aiChatPanelCss).toContain('max-width: calc(100% - 32px);');
    expect(aiChatPanelCss).toContain('.ai-settings-body .ant-message .ant-message-notice-content {');
    expect(aiChatPanelCss).toContain('white-space: normal;');
    expect(aiChatPanelCss).toContain('overflow-wrap: anywhere;');
  });
});
