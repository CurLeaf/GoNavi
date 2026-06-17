import { describe, expect, it } from 'vitest';

import { buildAISafetySnapshot } from './aiSafetyInsights';

describe('buildAISafetySnapshot', () => {
  it('describes readonly ai safety when no active connection is selected', () => {
    const snapshot = buildAISafetySnapshot({
      safetyLevel: 'readonly',
      connections: [],
    });

    expect(snapshot.safetyLevel).toBe('readonly');
    expect(snapshot.permissionMatrix.allowQuery).toBe(true);
    expect(snapshot.permissionMatrix.allowDML).toBe(false);
    expect(snapshot.permissionMatrix.allowDDL).toBe(false);
    expect(snapshot.hasActiveConnection).toBe(false);
    expect(snapshot.effectiveRestrictions).toContain('只读模式仅允许查询语句。');
    expect(snapshot.recommendations).toContain('如需执行 INSERT/UPDATE/DELETE，请先把 AI 安全级别切到读写模式。');
  });

  it('includes jvm connection restrictions and MCP write confirmation hints', () => {
    const snapshot = buildAISafetySnapshot({
      safetyLevel: 'readwrite',
      connections: [
        {
          id: 'jvm-1',
          name: 'JVM 诊断环境',
          config: {
            type: 'jvm',
            host: '10.0.0.8',
            port: 0,
            user: '',
            jvm: {
              environment: 'uat',
              readOnly: true,
              diagnostic: {
                transport: 'agent-bridge',
                allowObserveCommands: true,
                allowTraceCommands: true,
                allowMutatingCommands: false,
              },
            },
          },
        },
      ],
      tabs: [
        {
          id: 'diag-tab-1',
          title: 'JVM 诊断',
          type: 'jvm-diagnostic',
          connectionId: 'jvm-1',
          readOnly: true,
        },
      ],
      activeTabId: 'diag-tab-1',
    });

    expect(snapshot.permissionMatrix.allowDML).toBe(true);
    expect(snapshot.permissionMatrix.allowDDL).toBe(false);
    expect(snapshot.activeConnection?.readOnly).toBe(true);
    expect(snapshot.jvmGuards?.allowMutatingCommands).toBe(false);
    expect(snapshot.effectiveRestrictions.join('\n')).toContain('allowMutating=true');
    expect(snapshot.effectiveRestrictions.join('\n')).toContain('当前 JVM 诊断明确禁止 mutating 命令');
  });

  it('describes full safety mode as allowing other statements with confirmation', () => {
    const snapshot = buildAISafetySnapshot({
      safetyLevel: 'full',
      connections: [],
    });

    expect(snapshot.safetyLevel).toBe('full');
    expect(snapshot.permissionMatrix.allowDML).toBe(true);
    expect(snapshot.permissionMatrix.allowDDL).toBe(true);
    expect(snapshot.sqlRuleText).toContain('允许所有 SQL 操作');
    expect(snapshot.effectiveRestrictions.join('\n')).toContain('高风险或未识别语句仍会要求确认');
  });
});
