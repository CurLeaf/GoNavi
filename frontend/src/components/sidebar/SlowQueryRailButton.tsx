import { lazy, Suspense, useMemo, useState } from 'react'
import { Tooltip } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import { useStore } from '../../store'
import type { ConnectionConfig } from '../../types'
// lazy 加载避免 SlowQueryPanel（react-flow + dagre 约 200KB）进入主 bundle
const SlowQueryPanel = lazy(() => import('../explain/SlowQueryPanel'))

// Sidebar 顶部的慢 SQL 历史入口。
//
// 设计要点：
//   - 完全独立组件，不依赖 Sidebar.tsx 内部 state（避免改 Sidebar Props）
//   - 自己从 store 读取 tabs/connections，解析当前激活 tab 的连接配置
//   - 通过 lazy import SlowQueryPanel（react-flow/dagre 不进入主 bundle）
//   - 没有激活的连接时按钮禁用，hover 给提示
//
// 挂载位置：由调用方决定（App.tsx 把它放在 Sidebar 容器内）

interface SlowQueryRailButtonProps {
  /** 自定义 className 用于外层定位 */
  className?: string
  /** 自定义 style（用于绝对定位到 Sidebar 角落） */
  style?: React.CSSProperties
}

export default function SlowQueryRailButton({ className, style }: SlowQueryRailButtonProps) {
  const [open, setOpen] = useState(false)
  const tabs = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const connections = useStore(s => s.connections)

  // 解析当前激活 tab 的 ConnectionConfig
  const activeConfig = useMemo<ConnectionConfig | null>(() => {
    if (!activeTabId) return null
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab?.connectionId) return null
    const conn = connections.find(c => c.id === tab.connectionId)
    if (!conn) return null
    return {
      ...conn.config,
      port: Number(conn.config.port),
      password: conn.config.password || '',
      database: conn.config.database || '',
      useSSH: conn.config.useSSH || false,
      ssh: conn.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
    } as ConnectionConfig
  }, [tabs, activeTabId, connections])

  const activeTab = tabs.find(t => t.id === activeTabId)
  const dbName = activeTab?.dbName || ''

  const buttonDisabled = !activeConfig
  const tooltipText = buttonDisabled
    ? '请先打开一个数据库连接的查询标签'
    : '查看当前连接的慢 SQL 历史（Ctrl+Shift+L）'

  return (
    <>
      <Tooltip title={tooltipText} placement="right">
        <button
          type="button"
          className={className}
          onClick={() => !buttonDisabled && setOpen(true)}
          disabled={buttonDisabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            border: 'none',
            background: 'transparent',
            cursor: buttonDisabled ? 'not-allowed' : 'pointer',
            color: buttonDisabled
              ? 'var(--gn-text-muted, #adb5bd)'
              : 'var(--gn-text, #495057)',
            opacity: buttonDisabled ? 0.5 : 1,
            transition: 'opacity 0.15s, color 0.15s',
            ...style,
          }}
          aria-label="慢 SQL 历史"
        >
          <HistoryOutlined style={{ fontSize: 16 }} />
        </button>
      </Tooltip>

      {open && activeConfig && (
        <Suspense fallback={null}>
          <SlowQueryPanel
            open={open}
            onClose={() => setOpen(false)}
            config={activeConfig}
            dbName={dbName}
          />
        </Suspense>
      )}
    </>
  )
}
