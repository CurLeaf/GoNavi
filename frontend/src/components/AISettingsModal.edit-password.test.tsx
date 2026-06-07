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
    expect(source).toContain('保存自定义提示词');
  });

  it('loads MCP servers and skills through the AI service', () => {
    expect(source).toContain('Service.AIGetMCPClientInstallStatuses?.()');
    expect(source).toContain('Service.AIGetMCPServers?.()');
    expect(source).toContain('Service.AIListMCPTools?.()');
    expect(source).toContain('Service.AIGetSkills?.()');
    expect(source).toContain('新增 MCP 服务');
    expect(source).toContain('新增 Skill');
  });

  it('explains external MCP installation and renders selectable client install states', () => {
    expect(source).toContain('把 GoNavi 注册成外部 AI 客户端可调用的 MCP Server');
    expect(source).toContain('安装到外部客户端');
    expect(source).toContain('未安装');
    expect(source).toContain('需更新');
    expect(source).toContain('已安装');
    expect(source).toContain('刷新状态');
    expect(source).toContain('复制配置路径');
    expect(source).toContain('复制启动命令');
    expect(source).toContain('handleInstallSelectedMCPClient');
    expect(source).toContain('无需重复安装');
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
