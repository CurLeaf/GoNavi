import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPClientStatusPanel from './AIMCPClientStatusPanel';

describe('AIMCPClientStatusPanel', () => {
  it('renders selected remote client status, boundary notes, and remote quick-start actions', () => {
    const markup = renderToStaticMarkup(
      <AIMCPClientStatusPanel
        selectedStatus={{
          client: 'hermans',
          displayName: 'Hermans',
          installMode: 'remote',
          installed: false,
          matchesCurrent: false,
          clientDetected: false,
          clientCommand: 'hermans',
          message: 'Hermans 这类远程 Agent 请通过远程 MCP 桥接接入 Windows GoNavi，不要复制数据库密码。',
        }}
        selectedCommandText=""
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBorder="rgba(0,0,0,0.08)"
        statusLoading={false}
        onRefreshStatus={() => {}}
        onCopyConfigPath={() => {}}
        onCopyLaunchCommand={() => {}}
      />,
    );

    expect(markup).toContain('已选客户端状态');
    expect(markup).toContain('当前目标客户端：Hermans');
    expect(markup).toContain('需要通过远程 MCP 桥接调用当前 GoNavi');
    expect(markup).toContain('远程接入边界');
    expect(markup).toContain('不注册 execute_sql');
    expect(markup).toContain('Hermans 远程 MCP 快速配置');
    expect(markup).toContain('CLI 检测：远程 Agent 不需要检测本机 hermans 命令');
    expect(markup).toContain('刷新状态');
    expect(markup).toContain('复制配置路径');
    expect(markup).toContain('复制启动命令');
  });
});
