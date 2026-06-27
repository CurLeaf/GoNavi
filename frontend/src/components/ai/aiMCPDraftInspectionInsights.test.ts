import { describe, expect, it } from 'vitest';

import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import { buildMCPDraftInspectionSnapshot } from './aiMCPDraftInspectionInsights';

const templateTitle = (key: string) => {
  const template = MCP_SERVER_DRAFT_TEMPLATES.find((item) => item.key === key);
  if (!template) {
    throw new Error(`Missing MCP draft template: ${key}`);
  }
  return template.title;
};

describe('aiMCPDraftInspectionInsights', () => {
  it('parses a full MCP launch command and returns reusable field values', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      fullCommand: '$env:GITHUB_TOKEN="ghp test"; uvx mcp-server-github --stdio',
      timeoutSeconds: 45,
    });

    expect(snapshot.parse).toMatchObject({
      ok: true,
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      envKeys: ['GITHUB_TOKEN'],
    });
    expect(snapshot.input.fullCommand).toBe('GITHUB_TOKEN=*** uvx mcp-server-github --stdio');
    expect(snapshot.draft.launchCommandPreview).toBe('uvx mcp-server-github --stdio');
    expect(snapshot.draft.envKeys).toEqual(['GITHUB_TOKEN']);
    expect(snapshot.draft.envHints).toMatchObject({
      envVarCount: 1,
      secretLikeCount: 1,
      items: [{
        key: 'GITHUB_TOKEN',
        category: 'secret',
        label: 'GitHub Token',
        sensitive: true,
        known: true,
      }],
    });
    expect(snapshot.draft.envHints?.nextActions.join('\n')).toContain('Secret-like variables are stored only in local configuration');
    expect(snapshot.draft.timeoutSeconds).toBe(45);
    expect(snapshot.draft.suggestedServerSeed).toMatchObject({
      name: 'mcp-server-github',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      env: { GITHUB_TOKEN: '***' },
      envRedacted: true,
      timeoutSeconds: 45,
    });
    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'uvx',
      title: templateTitle('uvx'),
      confidence: 'high',
    });
    expect(snapshot.validation.canSave).toBe(true);
    expect(snapshot.nextActions).toContain('The current draft can be saved and tested for tool discovery; if it discovers 0 tools, check whether the service supports stdio.');
    expect(JSON.stringify(snapshot)).not.toContain('ghp test');
  });

  it('validates split fields and returns concrete next actions for common mistakes', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      command: 'npx -y @modelcontextprotocol/server-filesystem --stdio',
      args: ['env', 'GITHUB_TOKEN=abc'],
      envText: 'export TOKEN=abc',
      timeoutSeconds: 1,
    });

    expect(snapshot.draft.command).toBe('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(snapshot.validation.errorCount).toBe(1);
    expect(snapshot.validation.warningCount).toBeGreaterThanOrEqual(3);
    expect(snapshot.validation.issues.map((issue) => issue.key)).toEqual(expect.arrayContaining([
      'command-whole-line',
      'args-contain-env-or-shell-glue',
      'env-invalid-lines',
      'timeout-out-of-range',
    ]));
    expect(snapshot.nextActions.join('\n')).toContain('Put the whole command into the full command field for auto-splitting');
    expect(snapshot.nextActions.join('\n')).toContain('Write environment variables as one KEY=VALUE per line');
  });

  it('applies the docker template and explains docker-specific missing args', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      templateKey: 'docker',
      args: ['run', '--rm'],
      timeoutSeconds: 10,
    });

    expect(snapshot.draft.command).toBe('docker');
    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'docker',
      title: templateTitle('docker'),
    });
    expect(snapshot.draft.suggestedServerSeed).toMatchObject({
      name: 'docker',
      command: 'docker',
      timeoutSeconds: 10,
    });
    expect(snapshot.validation.issues.map((issue) => issue.key)).toContain('docker-interactive-missing');
    expect(snapshot.validation.issues.map((issue) => issue.key)).toContain('docker-image-missing');
    expect(snapshot.nextActions.join('\n')).toContain('Add -i or --interactive to Docker MCP args');
    expect(snapshot.nextActions.join('\n')).toContain('Add the image name from README to Docker MCP args');
  });

  it('localizes draft inspection wrapper copy while preserving raw command details', () => {
    const translate = (key: string) => ({
      'ai_chat.inspection.mcp_draft.default_name': 'T_DEFAULT_DRAFT',
      'ai_chat.inspection.mcp_draft.parse.no_full_command': 'T_NO_FULL_COMMAND',
      'ai_chat.inspection.mcp_draft.next_action.command_whole_line': 'T_SPLIT_COMMAND',
      'ai_chat.inspection.mcp_draft.next_action.env_lines': 'T_ENV_LINES',
      'ai_chat.inspection.mcp_draft.next_action.timeout': 'T_TIMEOUT',
      'ai_chat.inspection.mcp_draft.next_action.send_full_command': 'T_SEND_FULL_COMMAND',
    }[key] || key);

    const snapshot = buildMCPDraftInspectionSnapshot({
      command: 'npx -y @modelcontextprotocol/server-filesystem --stdio',
      args: ['env', 'GITHUB_TOKEN=abc'],
      envText: 'export TOKEN=abc',
      timeoutSeconds: 1,
      translate,
    } as Parameters<typeof buildMCPDraftInspectionSnapshot>[0] & { translate: typeof translate });

    expect(snapshot.draft.name).toBe('T_DEFAULT_DRAFT');
    expect(snapshot.parse.error).toBe('T_NO_FULL_COMMAND');
    expect(snapshot.nextActions).toEqual([
      'T_SPLIT_COMMAND',
      'T_ENV_LINES',
      'T_TIMEOUT',
      'T_SEND_FULL_COMMAND',
    ]);
    expect(snapshot.draft.command).toBe('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(snapshot.draft.args).toEqual(['env', 'GITHUB_TOKEN=***']);
    expect(JSON.stringify(snapshot)).not.toContain('GITHUB_TOKEN=abc');
  });

  it('localizes recommended template copy while keeping launch preview raw', () => {
    const translate = (key: string) => ({
      'ai_settings.mcp_server.template.uvx.title': 'T_TEMPLATE_UVX_TITLE',
      'ai_settings.mcp_server.template.uvx.description': 'T_TEMPLATE_UVX_DESCRIPTION',
    }[key] || key);

    const snapshot = buildMCPDraftInspectionSnapshot({
      fullCommand: 'uvx mcp-server-fetch --stdio',
      translate,
    } as Parameters<typeof buildMCPDraftInspectionSnapshot>[0] & { translate: typeof translate });

    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'uvx',
      title: 'T_TEMPLATE_UVX_TITLE',
      description: 'T_TEMPLATE_UVX_DESCRIPTION',
      exampleLaunchPreview: 'uvx some-mcp-server',
      confidence: 'high',
    });
  });
});
