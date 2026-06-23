import Modal from './common/ResizableDraggableModal';
import React from 'react';
import { Button, Typography } from 'antd';
import {
  formatExportProgressRows,
} from '../utils/exportProgress';
import ExportProgressBar from './ExportProgressBar';
import { useExportProgressRunner } from './useExportProgressRunner';

const { Text, Paragraph } = Typography;

export function useExportProgressDialog() {
  const { state, reset, runExportWithProgress } = useExportProgressRunner();

  const canClose = state.status === 'done' || state.status === 'error';

  const modalNode = (
    <Modal
      title={state.status === 'error' ? '导出失败' : (state.status === 'done' ? '导出完成' : '正在导出')}
      open={state.open}
      width={560}
      mask={false}
      keyboard={canClose}
      closable={canClose}
      onCancel={reset}
      footer={canClose ? [
        <Button key="close" onClick={reset}>关闭</Button>,
      ] : null}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 8, columnGap: 8 }}>
          <Text type="secondary">任务</Text>
          <Text>{state.title || state.targetName || '导出任务'}</Text>

          <Text type="secondary">对象</Text>
          <Text>{state.targetName || '未命名对象'}</Text>

          <Text type="secondary">格式</Text>
          <Text>{state.format || '-'}</Text>

          <Text type="secondary">状态</Text>
          <Text>{state.stage || '准备中'}</Text>

          {state.filePath ? (
            <>
              <Text type="secondary">文件</Text>
              <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>{state.filePath}</Paragraph>
            </>
          ) : null}
        </div>

        <ExportProgressBar
          status={state.status}
          current={state.current}
          total={state.total}
          totalRowsKnown={state.totalRowsKnown}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text type="secondary">{formatExportProgressRows(state.current, state.total, state.totalRowsKnown)}</Text>
          {!state.totalRowsKnown && state.status !== 'done' && state.status !== 'error' ? (
            <Text type="secondary">当前未预先统计总行数，暂不显示百分比，写入行数为实时值。</Text>
          ) : null}
          {state.message ? (
            <Text type="danger">{state.message}</Text>
          ) : null}
        </div>
      </div>
    </Modal>
  );

  return {
    exportProgressModal: modalNode,
    runExportWithProgress,
  };
}
