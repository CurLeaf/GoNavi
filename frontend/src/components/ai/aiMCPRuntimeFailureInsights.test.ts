import { describe, expect, it } from 'vitest';

import { buildMCPRuntimeFailureSnapshot } from './aiMCPRuntimeFailureInsights';

describe('buildMCPRuntimeFailureSnapshot', () => {
  it.each([
    [
      'zh-TW',
      '2026/06/11 10:00:00.000000 [ERROR] \u555f\u52d5 GoNavi MCP HTTP \u670d\u52d9\u5931\u6557: listen tcp 127.0.0.1:8765: bind: permission denied',
      '2026/06/11 10:00:01.000000 [ERROR] GoNavi MCP HTTP \u670d\u52d9\u7570\u5e38\u9000\u51fa: MCP HTTP \u5b50\u7a0b\u5e8f\u5df2\u9000\u51fa',
    ],
    [
      'ja-JP',
      '2026/06/11 10:00:00.000000 [ERROR] GoNavi MCP HTTP \u30b5\u30fc\u30d3\u30b9\u306e\u8d77\u52d5\u306b\u5931\u6557\u3057\u307e\u3057\u305f: listen tcp 127.0.0.1:8765: bind: permission denied',
      '2026/06/11 10:00:01.000000 [ERROR] GoNavi MCP HTTP \u30b5\u30fc\u30d3\u30b9\u304c\u7570\u5e38\u7d42\u4e86\u3057\u307e\u3057\u305f: MCP HTTP \u30b5\u30d6\u30d7\u30ed\u30bb\u30b9\u304c\u7d42\u4e86\u3057\u307e\u3057\u305f',
    ],
    [
      'de-DE',
      '2026/06/11 10:00:00.000000 [ERROR] Starten des GoNavi MCP HTTP-Dienstes fehlgeschlagen: listen tcp 127.0.0.1:8765: bind: permission denied',
      '2026/06/11 10:00:01.000000 [ERROR] Der GoNavi MCP HTTP-Dienst wurde unerwartet beendet: Der MCP HTTP-Unterprozess wurde beendet',
    ],
    [
      'ru-RU',
      '2026/06/11 10:00:00.000000 [ERROR] \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0441\u043b\u0443\u0436\u0431\u0443 GoNavi MCP HTTP: listen tcp 127.0.0.1:8765: bind: permission denied',
      '2026/06/11 10:00:01.000000 [ERROR] \u0421\u043b\u0443\u0436\u0431\u0430 GoNavi MCP HTTP \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0430\u0441\u044c \u0430\u0432\u0430\u0440\u0438\u0439\u043d\u043e: \u041f\u043e\u0434\u043f\u0440\u043e\u0446\u0435\u0441\u0441 MCP HTTP \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0441\u044f',
    ],
  ])('classifies localized MCP HTTP runtime wrappers for %s', (_locale, startLine, exitLine) => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [startLine, exitLine],
        },
      },
      includeLines: true,
    });

    expect(snapshot.failureEventCount).toBe(2);
    expect(snapshot.breakdown).toMatchObject({
      http_start_failed: 1,
      http_process_exited: 1,
      permission: 1,
      process_exit: 1,
    });
    expect(snapshot.nextActions.join('\n')).toContain('Check executable permissions');
    expect(snapshot.nextActions.join('\n')).toContain('Run the launch command in a terminal separately');
  });

  it('classifies MCP list-tools failures and joins them with configured servers', () => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          keyword: 'MCP',
          requestedLineLimit: 160,
          lines: [
            '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=GitHub): exec: "uvx": executable file not found in %PATH%',
            '2026/06/11 10:00:01.000000 [WARN] 列出 MCP 工具失败(server=DockerFetch): context deadline exceeded',
          ],
        },
      },
      mcpServers: [
        {
          id: 'github',
          name: 'GitHub',
          transport: 'stdio',
          command: 'uvx',
          args: ['mcp-server-github', '--stdio'],
          env: { GITHUB_TOKEN: 'secret-value' },
          enabled: true,
          timeoutSeconds: 20,
        },
        {
          id: 'docker-fetch',
          name: 'DockerFetch',
          transport: 'stdio',
          command: 'docker',
          args: ['run', '--rm', '-i', 'mcp/server-fetch:latest'],
          env: {},
          enabled: true,
          timeoutSeconds: 20,
        },
      ],
      mcpTools: [],
    });

    expect(snapshot.failureEventCount).toBe(2);
    expect(snapshot.breakdown).toMatchObject({
      list_tools_failed: 2,
      command_not_found: 1,
      timeout: 1,
    });
    expect(snapshot.failureServerNames).toEqual(['GitHub', 'DockerFetch']);
    expect(snapshot.serverSummaries.find((server) => server.name === 'DockerFetch')).toMatchObject({
      name: 'DockerFetch',
      discoveredToolCount: 0,
      recentFailureCount: 1,
      probableCauses: ['timeout'],
    });
    expect(snapshot.nextActions.join('\n')).toContain('Check that command contains only the executable name');
    expect(snapshot.nextActions.join('\n')).toContain('Raise timeoutSeconds to 45 or 60');
    expect(JSON.stringify(snapshot)).not.toContain('secret-value');
  });

  it('classifies English MCP discovery and tool-call wrappers after backend localization', () => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [
            '2026/06/11 10:00:00.000000 [WARN] Failed to list MCP tools(server=Filesystem): MCP command cannot be empty',
            '2026/06/11 10:00:01.000000 [WARN] MCP tool call failed(server=Filesystem): MCP command cannot be empty',
          ],
        },
      },
      mcpServers: [{
        id: 'filesystem',
        name: 'Filesystem',
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpTools: [],
    });

    expect(snapshot.failureEventCount).toBe(2);
    expect(snapshot.breakdown).toMatchObject({
      list_tools_failed: 1,
      tool_call_failed: 1,
      command_required: 2,
    });
    expect(snapshot.failureServerNames).toEqual(['Filesystem']);
    expect(snapshot.events.map((event) => event.kind)).toEqual([
      'list_tools_failed',
      'tool_call_failed',
    ]);
  });

  it.each([
    [
      'en-US',
      '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=Filesystem): MCP command cannot be empty',
    ],
    [
      'zh-TW',
      '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=Filesystem): MCP 命令不能為空',
    ],
    [
      'ja-JP',
      '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=Filesystem): MCP コマンドは空にできません',
    ],
    [
      'de-DE',
      '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=Filesystem): MCP-Befehl darf nicht leer sein',
    ],
    [
      'ru-RU',
      '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=Filesystem): Команда MCP не может быть пустой',
    ],
  ])('extracts command-required cause from localized MCP discovery failure logs for %s', (_locale, line) => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [line],
        },
      },
      mcpServers: [{
        id: 'filesystem',
        name: 'Filesystem',
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpTools: [],
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.breakdown).toMatchObject({
      list_tools_failed: 1,
      command_required: 1,
    });
    expect(snapshot.events[0]?.cause).toBe('command_required');
    expect(snapshot.nextActions.join('\n')).toContain('startup command');
  });

  it.each([
    [
      'zh-CN',
      '2026/06/11 10:00:00.000000 [WARN] \u5217\u51fa MCP \u5de5\u5177\u5931\u8d25(server=RemoteHTTP): \u6682\u4e0d\u652f\u6301\u7684 MCP \u4f20\u8f93\u65b9\u5f0f\uff1ahttp',
    ],
    [
      'zh-TW',
      '2026/06/11 10:00:00.000000 [WARN] \u5217\u51fa MCP \u5de5\u5177\u5931\u8d25(server=RemoteHTTP): \u66ab\u4e0d\u652f\u63f4\u7684 MCP \u50b3\u8f38\u65b9\u5f0f\uff1ahttp',
    ],
  ])('extracts transport cause from localized MCP transport-unsupported discovery logs for %s', (_locale, line) => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [line],
        },
      },
      mcpServers: [{
        id: 'remote-http',
        name: 'RemoteHTTP',
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpTools: [],
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.breakdown).toMatchObject({
      list_tools_failed: 1,
      transport: 1,
    });
    expect(snapshot.events[0]?.cause).toBe('transport');
    expect(snapshot.nextActions.join('\n')).toContain('stdio only');
    expect(snapshot.nextActions.join('\n')).toContain('HTTP MCP');
  });

  it('detects HTTP MCP process failures and redacts secret-like log values', () => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [
            '2026/06/11 10:00:00.000000 [ERROR] GoNavi MCP HTTP 服务启动失败：listen tcp 127.0.0.1:8765: bind: permission denied GONAVI_MCP_HTTP_TOKEN=abcdef1234567890',
            '2026/06/11 10:00:01.000000 [ERROR] GoNavi MCP HTTP 服务异常退出：exit status 1',
          ],
        },
      },
      includeLines: true,
    });

    expect(snapshot.failureEventCount).toBe(2);
    expect(snapshot.breakdown).toMatchObject({
      http_start_failed: 1,
      http_process_exited: 1,
      permission: 1,
      process_exit: 1,
    });
    expect(snapshot.events[0].linePreview).toContain('GONAVI_MCP_HTTP_TOKEN=***');
    expect(snapshot.lines?.join('\n')).not.toContain('abcdef1234567890');
  });

  it('classifies English MCP HTTP runtime failures after backend localization', () => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [
            '2026/06/11 10:00:00.000000 [ERROR] Failed to start GoNavi MCP HTTP service: listen tcp 127.0.0.1:8765: bind: permission denied',
            '2026/06/11 10:00:01.000000 [ERROR] GoNavi MCP HTTP service stopped unexpectedly: MCP HTTP subprocess exited',
          ],
        },
      },
      includeLines: true,
    });

    expect(snapshot.failureEventCount).toBe(2);
    expect(snapshot.breakdown).toMatchObject({
      http_start_failed: 1,
      http_process_exited: 1,
      permission: 1,
      process_exit: 1,
    });
    expect(snapshot.lines?.join('\n')).toContain('GoNavi MCP HTTP service stopped unexpectedly');
  });

  it('returns an actionable empty state when no MCP failures are found', () => {
    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          lines: [
            '2026/06/11 10:00:00.000000 [INFO] GoNavi MCP HTTP 服务已启动',
          ],
        },
      },
      mcpServers: [{
        id: 'ok',
        name: 'OK',
        transport: 'stdio',
        command: 'node',
        args: ['server.js', '--stdio'],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpTools: [{
        alias: 'mcp__ok__ping',
        serverId: 'ok',
        serverName: 'OK',
        originalName: 'ping',
      }],
    });

    expect(snapshot.failureEventCount).toBe(0);
    expect(snapshot.message).toContain('No MCP startup, tool discovery, or tool call failure signal');
    expect(snapshot.nextActions.join('\n')).toContain('increase lineLimit');
    expect(snapshot.serverSummaries[0].discoveredToolCount).toBe(1);
  });

  it('localizes runtime failure wrapper copy while preserving raw diagnostic details', () => {
    const translate = (key: string, params?: Record<string, unknown>) => ({
      'ai_chat.inspection.mcp_runtime.next_action.command_not_found': '检查翻译: command missing',
      'ai_chat.inspection.mcp_runtime.next_action.enabled_without_tools': '检查翻译: refresh discovery',
      'ai_chat.inspection.mcp_runtime.next_action.fix_discovery_first': '检查翻译: discovery first',
      'ai_chat.inspection.mcp_runtime.warning.failure_events': `警告翻译: failures=${params?.count}`,
      'ai_chat.inspection.mcp_runtime.warning.enabled_without_tools': `警告翻译: withoutTools=${params?.count}`,
      'ai_chat.inspection.mcp_runtime.message.failure_events': `消息翻译: failures=${params?.count}`,
    }[key] || key);

    const snapshot = buildMCPRuntimeFailureSnapshot({
      readResult: {
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          lines: [
            '2026/06/11 10:00:00.000000 [WARN] 列出 MCP 工具失败(server=GitHub): exec: "uvx": executable file not found in %PATH%',
          ],
        },
      },
      mcpServers: [{
        id: 'github',
        name: 'GitHub',
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-github', '--stdio'],
        env: { GITHUB_TOKEN: 'secret-value' },
        enabled: true,
        timeoutSeconds: 20,
      }],
      mcpTools: [],
      includeLines: true,
      translate,
    } as Parameters<typeof buildMCPRuntimeFailureSnapshot>[0] & { translate: typeof translate });

    expect(snapshot.message).toBe('消息翻译: failures=1');
    expect(snapshot.warnings).toEqual([
      '警告翻译: failures=1',
      '警告翻译: withoutTools=1',
    ]);
    expect(snapshot.nextActions).toEqual([
      '检查翻译: command missing',
      '检查翻译: refresh discovery',
      '检查翻译: discovery first',
    ]);
    expect(snapshot.events[0].serverName).toBe('GitHub');
    expect(snapshot.events[0].linePreview).toContain('exec: "uvx": executable file not found in %PATH%');
    expect(snapshot.serverSummaries[0]).toMatchObject({
      name: 'GitHub',
      launchCommandPreview: 'uvx mcp-server-github --stdio',
      envKeys: ['GITHUB_TOKEN'],
    });
    expect(JSON.stringify(snapshot)).not.toContain('secret-value');
  });
});
