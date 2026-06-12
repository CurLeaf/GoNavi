import { describe, expect, it } from 'vitest';

import { buildMCPRuntimeFailureSnapshot } from './aiMCPRuntimeFailureInsights';

describe('buildMCPRuntimeFailureSnapshot', () => {
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
    expect(snapshot.nextActions.join('\n')).toContain('检查 command 是否只填可执行程序本身');
    expect(snapshot.nextActions.join('\n')).toContain('提高 timeoutSeconds 到 45 或 60');
    expect(JSON.stringify(snapshot)).not.toContain('secret-value');
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
    expect(snapshot.message).toContain('没有发现 MCP 启动、工具发现或工具调用失败信号');
    expect(snapshot.nextActions.join('\n')).toContain('扩大 lineLimit');
    expect(snapshot.serverSummaries[0].discoveredToolCount).toBe(1);
  });
});
