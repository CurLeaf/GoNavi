import { describe, expect, it, vi } from 'vitest';

import { executeDiagnosticsSnapshotToolCall } from './aiSnapshotInspectionDiagnosticsToolExecutor';

const translate = (key: string, params?: Record<string, unknown>) => {
  const messages: Record<string, string> = {
    'ai_chat.inspection.diagnostics.error.read_app_logs_unsupported': 'APP_UNSUPPORTED',
    'ai_chat.inspection.diagnostics.error.read_app_logs_failed': `APP_FAILED :: ${params?.detail}`,
    'ai_chat.inspection.diagnostics.error.read_ai_upstream_logs_failed': `UPSTREAM_FAILED :: ${params?.detail}`,
    'ai_chat.inspection.diagnostics.error.read_recent_connection_failures_failed': `RECENT_FAILED :: ${params?.detail}`,
  };
  return messages[key] || key;
};

type DiagnosticsOverrides = Partial<Parameters<typeof executeDiagnosticsSnapshotToolCall>[0]> & {
  toolName: string;
};

const execute = (overrides: DiagnosticsOverrides) =>
  executeDiagnosticsSnapshotToolCall({
    args: {},
    connections: [],
    mcpTools: [],
    translate,
    ...overrides,
  });

describe('aiSnapshotInspectionDiagnosticsToolExecutor i18n', () => {
  it('localizes unsupported app-log reads through the diagnostics wrapper', async () => {
    const result = await execute({
      toolName: 'inspect_app_logs',
      runtime: {},
    });

    expect(result?.success).toBe(false);
    expect(result?.content).toBe('APP_FAILED :: APP_UNSUPPORTED');
  });

  it('localizes upstream-log read failures while preserving raw detail', async () => {
    const result = await execute({
      toolName: 'inspect_ai_upstream_logs',
      runtime: {
        readAppLogTail: vi.fn().mockResolvedValue({
          success: false,
          message: 'ENOENT: C:/Users/demo/.GoNavi/Logs/gonavi.log',
        }),
      },
    });

    expect(result?.success).toBe(false);
    expect(result?.content).toBe('UPSTREAM_FAILED :: ENOENT: C:/Users/demo/.GoNavi/Logs/gonavi.log');
  });

  it('localizes recent connection failure read failures while preserving raw detail', async () => {
    const result = await execute({
      toolName: 'inspect_recent_connection_failures',
      runtime: {
        readAppLogTail: vi.fn().mockResolvedValue({
          success: false,
          message: 'dial tcp 127.0.0.1:3306: connect: connection refused',
        }),
      },
    });

    expect(result?.success).toBe(false);
    expect(result?.content).toBe('RECENT_FAILED :: dial tcp 127.0.0.1:3306: connect: connection refused');
  });
});
