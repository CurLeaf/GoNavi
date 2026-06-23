import React, { useState } from 'react';
import { Button, Form, Input, Progress, message } from 'antd';
import type { FormInstance } from 'antd/es/form';
import Modal from '../common/ResizableDraggableModal';
import type { SavedConnection, ExternalSQLDirectory } from '../../types';
import { noAutoCapInputProps } from '../../utils/inputAutoCap';
import { buildExternalSQLDirectoryId, buildExternalSQLTabId } from '../../utils/externalSqlTree';
import { t } from '../../i18n';
import { resolveSidebarNodeConnectionId } from '../sidebarV2Utils';
import {
  isExternalSQLDirectoryModalMode,
  type ExternalSQLFileModalMode,
} from '../sidebarCoreUtils';
import {
  OpenSQLFile,
  ExecuteSQLFile,
  CancelSQLFileExecution,
  SelectSQLDirectory,
  ReadSQLFile,
  CreateSQLFile,
  CreateSQLDirectory,
  DeleteSQLFile,
  DeleteSQLDirectory,
  RenameSQLFile,
  RenameSQLDirectory,
} from '../../../wailsjs/go/app/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';

export type SQLFileExecutionStatus = 'running' | 'done' | 'cancelled' | 'error';

export type SQLFileExecutionProgressState = {
  fileSizeMB: string;
  status: SQLFileExecutionStatus;
  executed: number;
  failed: number;
  percent: number;
  currentSQL: string;
  resultMessage: string;
};

type SQLFileExecutionState = SQLFileExecutionProgressState & {
  open: boolean;
  jobId: string;
  total: number;
};

type ActiveExecutionContext = {
  connectionId?: string;
  dbName?: string;
} | null | undefined;

type RefreshExternalSQLRootNode = (
  showLoading?: boolean,
  directoriesOverride?: ExternalSQLDirectory[],
) => Promise<void>;

type UseSidebarExternalSqlWorkflowOptions = {
  connections: SavedConnection[];
  externalSQLDirectories: ExternalSQLDirectory[];
  activeTab: {
    connectionId?: string;
    dbName?: string;
  } | null;
  connectionIds: string[];
  selectedNodesRef: React.MutableRefObject<any[]>;
  addTab: (tab: any) => void;
  saveExternalSQLDirectory: (directory: ExternalSQLDirectory) => void;
  deleteExternalSQLDirectory: (directoryId: string) => void;
  refreshGlobalExternalSQLRootNode: RefreshExternalSQLRootNode;
  setExpandedKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  setAutoExpandParent: React.Dispatch<React.SetStateAction<boolean>>;
  getActiveContext: () => ActiveExecutionContext;
};

type ExternalSQLFileModalProps = {
  open: boolean;
  mode: ExternalSQLFileModalMode;
  form: FormInstance;
  onOk: () => void;
  onCancel: () => void;
};

type SQLFileExecutionModalProps = {
  title: React.ReactNode;
  state: SQLFileExecutionState;
  modalPanelStyle: React.CSSProperties;
  onCancelExecution: () => void;
  onClose: () => void;
};

const createInitialSQLFileExecutionState = (): SQLFileExecutionState => ({
  open: false,
  jobId: '',
  fileSizeMB: '',
  status: 'running',
  executed: 0,
  failed: 0,
  total: 0,
  percent: 0,
  currentSQL: '',
  resultMessage: '',
});

const normalizeExternalSQLFileName = (rawName: unknown): string => {
  const name = String(rawName || '').trim();
  if (!name) return '';
  return /\.sql$/i.test(name) ? name : `${name}.sql`;
};

const normalizeExternalSQLDirectoryName = (rawName: unknown): string => {
  return String(rawName || '').trim();
};

const getExternalSQLParentDirectoryPath = (node: any): string => {
  const path = String(node?.dataRef?.path || '').trim();
  if (node?.type === 'external-sql-directory' || node?.type === 'external-sql-folder') {
    return path;
  }
  if (node?.type === 'external-sql-file') {
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return index > 0 ? path.slice(0, index) : '';
  }
  return '';
};

const normalizeSQLFileDialogData = (data: unknown): { content: string; filePath: string; fileName: string; isLargeFile: boolean; fileSizeMB?: string } => {
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    const filePath = String(payload.filePath || '').trim();
    return {
      content: String(payload.content ?? ''),
      filePath,
      fileName: String(payload.name || filePath.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_file_exec.title')).trim(),
      isLargeFile: payload.isLargeFile === true,
      fileSizeMB: String(payload.fileSizeMB || '').trim() || undefined,
    };
  }
  return {
    content: String(data || ''),
    filePath: '',
    fileName: t('sidebar.sql_file_exec.title'),
    isLargeFile: false,
  };
};

const resolveSQLFileExecutionStatusLabel = (status: SQLFileExecutionStatus): string => {
  switch (status) {
    case 'done':
      return `✅ ${t('sidebar.sql_file_exec.status.done')}`;
    case 'cancelled':
      return `⚠️ ${t('sidebar.sql_file_exec.status.cancelled')}`;
    case 'error':
      return `❌ ${t('sidebar.sql_file_exec.status.error')}`;
    case 'running':
    default:
      return t('sidebar.sql_file_exec.status.running');
  }
};

export const buildSQLFileExecutionFooter = ({
  status,
  onCancelExecution,
  onClose,
}: {
  status: SQLFileExecutionStatus;
  onCancelExecution: () => void;
  onClose: () => void;
}): React.ReactNode[] => {
  if (status === 'running') {
    return [
      <Button key="cancel" danger onClick={onCancelExecution}>
        {t('sidebar.sql_file_exec.cancel')}
      </Button>,
    ];
  }

  return [
    <Button key="close" type="primary" onClick={onClose}>
      {t('sidebar.action.close')}
    </Button>,
  ];
};

export const SQLFileExecutionProgressContent: React.FC<SQLFileExecutionProgressState> = ({
  fileSizeMB,
  status,
  executed,
  failed,
  percent,
  currentSQL,
  resultMessage,
}) => (
  <>
    <div style={{ marginBottom: 16 }}>
      <Progress
        percent={Math.round(percent)}
        status={status === 'error' ? 'exception' : status === 'done' ? 'success' : 'active'}
        strokeColor={status === 'cancelled' ? '#faad14' : undefined}
      />
    </div>
    <div style={{ fontSize: 13, lineHeight: '22px', marginBottom: 8 }}>
      <div>{t('sidebar.sql_file_exec.file_size')}<strong>{fileSizeMB} MB</strong></div>
      <div>{t('sidebar.sql_file_exec.status_label')}<strong>{resolveSQLFileExecutionStatusLabel(status)}</strong></div>
      <div>
        {t('sidebar.sql_file_exec.executed_label')}
        <strong style={{ color: '#52c41a' }}>{executed}</strong>
        {t('sidebar.sql_file_exec.rows_separator')}
        <strong style={{ color: failed > 0 ? '#ff4d4f' : undefined }}>{failed}</strong>
        {t('sidebar.sql_file_exec.rows_suffix')}
      </div>
    </div>
    {currentSQL && status === 'running' && (
      <div style={{ fontSize: 12, color: 'rgba(128,128,128,0.8)', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '6px 10px', marginTop: 8, fontFamily: 'var(--gn-font-mono)', wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden' }}>
        {currentSQL}
      </div>
    )}
    {resultMessage && status !== 'running' && (
      <div style={{ fontSize: 12, marginTop: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '8px 12px' }}>
        {resultMessage}
      </div>
    )}
  </>
);

export const ExternalSQLFileModal: React.FC<ExternalSQLFileModalProps> = ({
  open,
  mode,
  form,
  onOk,
  onCancel,
}) => (
  <Modal
    title={
      mode === 'create'
        ? t('sidebar.external_sql_modal.title.create_file')
        : mode === 'rename'
          ? t('sidebar.external_sql_modal.title.rename_file')
          : mode === 'create-directory'
            ? t('sidebar.external_sql_modal.title.create_directory')
            : t('sidebar.external_sql_modal.title.rename_directory')
    }
    open={open}
    onOk={onOk}
    onCancel={onCancel}
    okText={t(mode === 'create' || mode === 'create-directory' ? 'sidebar.external_sql_modal.action.create' : 'sidebar.external_sql_modal.action.rename')}
    cancelText={t('common.cancel')}
  >
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label={isExternalSQLDirectoryModalMode(mode) ? t('sidebar.external_sql_modal.field.directory_name') : t('sidebar.external_sql_modal.field.sql_file_name')}
        rules={[
          { required: true, message: isExternalSQLDirectoryModalMode(mode) ? t('sidebar.external_sql_modal.validation.directory_name_required') : t('sidebar.external_sql_modal.validation.sql_file_name_required') },
          {
            validator: async (_, value) => {
              const name = String(value || '').trim();
              if (!name) return;
              if (/[\\/]/.test(name) || name === '.' || name === '..') {
                throw new Error(isExternalSQLDirectoryModalMode(mode) ? t('sidebar.external_sql_modal.validation.directory_name_no_separator') : t('sidebar.external_sql_modal.validation.sql_file_name_no_separator'));
              }
            },
          },
        ]}
        extra={isExternalSQLDirectoryModalMode(mode) ? t('sidebar.external_sql_modal.help.directory') : t('sidebar.external_sql_modal.help.sql_file')}
      >
        <Input {...noAutoCapInputProps} placeholder={isExternalSQLDirectoryModalMode(mode) ? t('sidebar.external_sql_modal.placeholder.directory_name') : t('sidebar.external_sql_modal.placeholder.sql_file_name')} />
      </Form.Item>
    </Form>
  </Modal>
);

export const SQLFileExecutionModal: React.FC<SQLFileExecutionModalProps> = ({
  title,
  state,
  modalPanelStyle,
  onCancelExecution,
  onClose,
}) => (
  <Modal
    title={title}
    open={state.open}
    centered
    closable={state.status !== 'running'}
    maskClosable={false}
    footer={buildSQLFileExecutionFooter({
      status: state.status,
      onCancelExecution,
      onClose,
    })}
    onCancel={() => {
      if (state.status !== 'running') {
        onClose();
      }
    }}
    styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none' }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none' } }}
  >
    <SQLFileExecutionProgressContent
      fileSizeMB={state.fileSizeMB}
      status={state.status}
      executed={state.executed}
      failed={state.failed}
      percent={state.percent}
      currentSQL={state.currentSQL}
      resultMessage={state.resultMessage}
    />
  </Modal>
);

export const useSidebarExternalSqlWorkflow = ({
  connections,
  externalSQLDirectories,
  activeTab,
  connectionIds,
  selectedNodesRef,
  addTab,
  saveExternalSQLDirectory,
  deleteExternalSQLDirectory,
  refreshGlobalExternalSQLRootNode,
  setExpandedKeys,
  setAutoExpandParent,
  getActiveContext,
}: UseSidebarExternalSqlWorkflowOptions) => {
  const [isExternalSQLFileModalOpen, setIsExternalSQLFileModalOpen] = useState(false);
  const [externalSQLFileForm] = Form.useForm();
  const [externalSQLFileModalMode, setExternalSQLFileModalMode] = useState<ExternalSQLFileModalMode>('create');
  const [externalSQLFileTarget, setExternalSQLFileTarget] = useState<any>(null);
  const [sqlFileExecState, setSqlFileExecState] = useState<SQLFileExecutionState>(createInitialSQLFileExecutionState);

  const startSQLFileExecution = (config: any, dbName: string, filePath: string, fileSizeMB: string) => {
    const jobId = `sqlfile-${Date.now()}`;
    setSqlFileExecState({
      open: true,
      jobId,
      fileSizeMB,
      status: 'running',
      executed: 0,
      failed: 0,
      total: 0,
      percent: 0,
      currentSQL: '',
      resultMessage: '',
    });

    const offProgress = EventsOn('sqlfile:progress', (event: any) => {
      if (!event || event.jobId !== jobId) return;
      setSqlFileExecState(prev => ({
        ...prev,
        status: event.status || prev.status,
        executed: typeof event.executed === 'number' ? event.executed : prev.executed,
        failed: typeof event.failed === 'number' ? event.failed : prev.failed,
        total: typeof event.total === 'number' ? event.total : prev.total,
        percent: typeof event.percent === 'number' ? Math.min(100, event.percent) : prev.percent,
        currentSQL: typeof event.currentSQL === 'string' ? event.currentSQL : prev.currentSQL,
      }));
    });

    ExecuteSQLFile(config, dbName, filePath, jobId).then(res => {
      offProgress();
      setSqlFileExecState(prev => ({
        ...prev,
        status: res.success ? 'done' : (prev.status === 'cancelled' ? 'cancelled' : 'error'),
        percent: 100,
        resultMessage: res.message || '',
      }));
    }).catch(err => {
      offProgress();
      setSqlFileExecState(prev => ({
        ...prev,
        status: 'error',
        resultMessage: String(err?.message || err),
      }));
    });
  };

  const handleRunSQLFile = async (node: any) => {
    const res = await OpenSQLFile();
    if (res.success) {
      const data = normalizeSQLFileDialogData(res.data);
      if (data.isLargeFile) {
        const connId = node.type === 'connection' ? node.key : node.dataRef?.id;
        const dbName = node.dataRef?.dbName || '';
        const conn = connections.find(c => c.id === connId);
        if (!conn) {
          message.error(t('sidebar.message.connection_config_not_found'));
          return;
        }
        startSQLFileExecution(conn.config, dbName, data.filePath, data.fileSizeMB || '');
        return;
      }

      const { dbName, id } = node.dataRef;
      const connectionId = node.type === 'connection' ? String(node.key) : String(id || node.dataRef.id || '');
      addTab({
        id: data.filePath ? buildExternalSQLTabId(connectionId, dbName || '', data.filePath) : `query-${Date.now()}`,
        title: data.fileName || t('sidebar.sql_file_exec.title'),
        type: 'query',
        connectionId,
        dbName: dbName,
        query: data.content,
        filePath: data.filePath || undefined,
      });
    } else if (res.message !== '已取消') {
      message.error(t('sidebar.message.read_file_failed', { error: res.message }));
    }
  };

  const handleOpenSQLFileFromToolbar = async () => {
    const ctx = getActiveContext();
    if (!ctx?.connectionId) {
      message.warning(t('sidebar.message.select_connection_or_database_first'));
      return;
    }
    const res = await OpenSQLFile();
    if (res.success) {
      const data = normalizeSQLFileDialogData(res.data);
      if (data.isLargeFile) {
        const conn = connections.find(c => c.id === ctx.connectionId);
        if (!conn) {
          message.error(t('sidebar.message.connection_config_not_found'));
          return;
        }
        startSQLFileExecution(conn.config, ctx.dbName || '', data.filePath, data.fileSizeMB || '');
        return;
      }

      addTab({
        id: data.filePath ? buildExternalSQLTabId(ctx.connectionId, ctx.dbName || '', data.filePath) : `query-${Date.now()}`,
        title: data.fileName || t('sidebar.sql_file_exec.title'),
        type: 'query',
        connectionId: ctx.connectionId,
        dbName: ctx.dbName || undefined,
        query: data.content,
        filePath: data.filePath || undefined,
      });
    } else if (res.message !== '已取消') {
      message.error(t('sidebar.message.read_file_failed', { error: res.message }));
    }
  };

  const resolveExternalSQLExecutionContext = (): { connectionId: string; dbName: string } => {
    const activeStoreContext = getActiveContext();
    const selectedConnectionId = selectedNodesRef.current
      .map((node) => resolveSidebarNodeConnectionId(node, connectionIds))
      .find(Boolean) || '';
    return {
      connectionId: String(
        activeStoreContext?.connectionId
        || activeTab?.connectionId
        || selectedConnectionId
        || '',
      ).trim(),
      dbName: String(
        activeStoreContext?.dbName
        || activeTab?.dbName
        || '',
      ).trim(),
    };
  };

  const openExternalSQLFile = async (fileNode: any) => {
    const fileContext = {
      connectionId: String(fileNode?.dataRef?.connectionId || '').trim(),
      dbName: String(fileNode?.dataRef?.dbName || '').trim(),
    };
    const fallbackContext = resolveExternalSQLExecutionContext();
    const connectionId = fileContext.connectionId || fallbackContext.connectionId;
    const dbName = fileContext.dbName || fallbackContext.dbName;
    const filePath = String(fileNode?.dataRef?.path || '').trim();
    const fileName = String(fileNode?.dataRef?.name || fileNode?.title || t('sidebar.sql_file.default_name')).trim() || t('sidebar.sql_file.default_name');
    if (!filePath) {
      message.error(t('sidebar.message.sql_file_path_incomplete'));
      return;
    }

    const res = await ReadSQLFile(filePath);
    if (!res.success) {
      if (res.message !== '已取消') {
        message.error(t('sidebar.message.read_sql_file_failed', { error: res.message }));
      }
      return;
    }

    const data = res.data;
    if (data && typeof data === 'object' && data.isLargeFile) {
      if (!connectionId) {
        message.warning(t('sidebar.message.select_host_before_large_sql_file'));
        return;
      }
      const conn = connections.find((item) => item.id === connectionId);
      if (!conn) {
        message.error(t('sidebar.message.connection_config_not_found'));
        return;
      }
      startSQLFileExecution(conn.config, dbName, data.filePath, data.fileSizeMB);
      return;
    }

    addTab({
      id: buildExternalSQLTabId(connectionId, dbName, filePath),
      title: fileName,
      type: 'query',
      connectionId,
      dbName: dbName || undefined,
      query: String(data || ''),
      filePath,
    });
  };

  const openCreateExternalSQLFileModal = (node: any) => {
    const directoryPath = getExternalSQLParentDirectoryPath(node);
    if (!directoryPath) {
      message.error(t('sidebar.message.external_sql_file_parent_missing'));
      return;
    }
    setExternalSQLFileModalMode('create');
    setExternalSQLFileTarget(node);
    externalSQLFileForm.setFieldsValue({ name: 'new-query.sql' });
    setIsExternalSQLFileModalOpen(true);
  };

  const openRenameExternalSQLFileModal = (node: any) => {
    const currentName = String(node?.dataRef?.name || node?.title || '').trim();
    if (!currentName) {
      message.error(t('sidebar.message.external_sql_file_rename_target_missing'));
      return;
    }
    setExternalSQLFileModalMode('rename');
    setExternalSQLFileTarget(node);
    externalSQLFileForm.setFieldsValue({ name: currentName });
    setIsExternalSQLFileModalOpen(true);
  };

  const openCreateExternalSQLDirectoryModal = (node: any) => {
    const directoryPath = getExternalSQLParentDirectoryPath(node);
    if (!directoryPath) {
      message.error(t('sidebar.message.external_sql_directory_parent_missing'));
      return;
    }
    setExternalSQLFileModalMode('create-directory');
    setExternalSQLFileTarget(node);
    externalSQLFileForm.setFieldsValue({ name: 'new-folder' });
    setIsExternalSQLFileModalOpen(true);
  };

  const openRenameExternalSQLDirectoryModal = (node: any) => {
    const currentName = String(node?.dataRef?.name || node?.title || '').trim();
    if (!currentName) {
      message.error(t('sidebar.message.external_sql_directory_rename_target_missing'));
      return;
    }
    setExternalSQLFileModalMode('rename-directory');
    setExternalSQLFileTarget(node);
    externalSQLFileForm.setFieldsValue({ name: currentName });
    setIsExternalSQLFileModalOpen(true);
  };

  const closeExternalSQLFileModal = () => {
    setIsExternalSQLFileModalOpen(false);
    setExternalSQLFileTarget(null);
    externalSQLFileForm.resetFields();
  };

  const handleExternalSQLFileModalOk = async () => {
    try {
      const values = await externalSQLFileForm.validateFields();
      const isDirectoryMode = isExternalSQLDirectoryModalMode(externalSQLFileModalMode);
      const name = isDirectoryMode
        ? normalizeExternalSQLDirectoryName(values.name)
        : normalizeExternalSQLFileName(values.name);
      if (!name) {
        message.error(t(isDirectoryMode ? 'sidebar.message.sql_directory_name_required' : 'sidebar.message.sql_file_name_required'));
        return;
      }

      if (externalSQLFileModalMode === 'create') {
        const directoryPath = getExternalSQLParentDirectoryPath(externalSQLFileTarget);
        if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_file_parent_missing'));
          return;
        }
        const res = await CreateSQLFile(directoryPath, name);
        if (!res.success) {
          message.error(t('sidebar.message.create_sql_file_failed', { error: res.message }));
          return;
        }
        await refreshGlobalExternalSQLRootNode(false);
        message.success(t('sidebar.message.sql_file_created'));
      } else if (externalSQLFileModalMode === 'rename') {
        const filePath = String(externalSQLFileTarget?.dataRef?.path || '').trim();
        if (!filePath) {
          message.error(t('sidebar.message.external_sql_file_rename_target_missing'));
          return;
        }
        const res = await RenameSQLFile(filePath, name);
        if (!res.success) {
          message.error(t('sidebar.message.rename_sql_file_failed', { error: res.message }));
          return;
        }
        await refreshGlobalExternalSQLRootNode(false);
        message.success(t('sidebar.message.sql_file_renamed'));
      } else if (externalSQLFileModalMode === 'create-directory') {
        const directoryPath = getExternalSQLParentDirectoryPath(externalSQLFileTarget);
        if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_directory_parent_missing'));
          return;
        }
        const res = await CreateSQLDirectory(directoryPath, name);
        if (!res.success) {
          message.error(t('sidebar.message.create_sql_directory_failed', { error: res.message }));
          return;
        }
        await refreshGlobalExternalSQLRootNode(false);
        message.success(t('sidebar.message.sql_directory_created'));
      } else {
        const directoryPath = String(externalSQLFileTarget?.dataRef?.path || '').trim();
        if (!directoryPath) {
          message.error(t('sidebar.message.external_sql_directory_rename_target_missing'));
          return;
        }
        const res = await RenameSQLDirectory(directoryPath, name);
        if (!res.success) {
          message.error(t('sidebar.message.rename_sql_directory_failed', { error: res.message }));
          return;
        }

        if (externalSQLFileTarget?.type === 'external-sql-directory') {
          const payload = (res.data && typeof res.data === 'object') ? res.data as Record<string, unknown> : {};
          const nextPath = String(payload.directoryPath || payload.path || '').trim();
          const nextName = String(payload.name || name).trim();
          const oldDirectoryId = String(externalSQLFileTarget?.dataRef?.id || '').trim();
          if (!nextPath || !oldDirectoryId) {
            message.error(t('sidebar.message.external_sql_directory_rename_sync_failed'));
            await refreshGlobalExternalSQLRootNode(false);
            return;
          }
          const nextDirectory: ExternalSQLDirectory = {
            id: buildExternalSQLDirectoryId('', '', nextPath),
            name: nextName || nextPath.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_directory.default_name'),
            path: nextPath,
            createdAt: Number(externalSQLFileTarget?.dataRef?.createdAt) || Date.now(),
          };
          deleteExternalSQLDirectory(oldDirectoryId);
          saveExternalSQLDirectory(nextDirectory);
          const nextDirectories = [
            ...externalSQLDirectories.filter((item) => item.id !== oldDirectoryId),
            nextDirectory,
          ];
          await refreshGlobalExternalSQLRootNode(false, nextDirectories);
        } else {
          await refreshGlobalExternalSQLRootNode(false);
        }
        message.success(t('sidebar.message.sql_directory_renamed'));
      }

      closeExternalSQLFileModal();
    } catch {
      // Validate failed
    }
  };

  const handleDeleteExternalSQLFile = (node: any) => {
    const filePath = String(node?.dataRef?.path || '').trim();
    const fileName = String(node?.dataRef?.name || node?.title || t('sidebar.sql_file.default_name')).trim();
    if (!filePath) {
      message.error(t('sidebar.message.external_sql_file_delete_target_missing'));
      return;
    }

    Modal.confirm({
      title: t('sidebar.modal.confirm_delete_sql_file.title'),
      content: t('sidebar.modal.confirm_delete_sql_file.content', { name: fileName }),
      okText: t('sidebar.action.delete'),
      cancelText: t('sidebar.action.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await DeleteSQLFile(filePath);
        if (!res.success) {
          message.error(t('sidebar.message.delete_sql_file_failed', { error: res.message }));
          return;
        }
        await refreshGlobalExternalSQLRootNode(false);
        message.success(t('sidebar.message.sql_file_deleted'));
      },
    });
  };

  const handleDeleteExternalSQLDirectory = (node: any) => {
    const directoryPath = String(node?.dataRef?.path || '').trim();
    const directoryName = String(node?.dataRef?.name || node?.title || t('sidebar.sql_directory.default_name')).trim();
    if (!directoryPath) {
      message.error(t('sidebar.message.external_sql_directory_delete_target_missing'));
      return;
    }

    Modal.confirm({
      title: t('sidebar.modal.confirm_delete_sql_directory.title'),
      content: t('sidebar.modal.confirm_delete_sql_directory.content', { name: directoryName }),
      okText: t('sidebar.action.delete'),
      cancelText: t('sidebar.action.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await DeleteSQLDirectory(directoryPath);
        if (!res.success) {
          message.error(t('sidebar.message.delete_sql_directory_failed', { error: res.message }));
          return;
        }

        if (node?.type === 'external-sql-directory') {
          const directoryId = String(node?.dataRef?.id || '').trim();
          if (directoryId) {
            deleteExternalSQLDirectory(directoryId);
            const nextDirectories = externalSQLDirectories.filter((item) => item.id !== directoryId);
            await refreshGlobalExternalSQLRootNode(false, nextDirectories);
          } else {
            await refreshGlobalExternalSQLRootNode(false);
          }
        } else {
          await refreshGlobalExternalSQLRootNode(false);
        }
        message.success(t('sidebar.message.sql_directory_deleted'));
      },
    });
  };

  const handleAddExternalSQLDirectory = async (node: any) => {
    void node;
    const currentDirectory = externalSQLDirectories[0]?.path || '';
    const selection = await SelectSQLDirectory(currentDirectory);
    if (!selection.success) {
      if (selection.message !== '已取消') {
        message.error(t('sidebar.message.select_sql_directory_failed', { error: selection.message }));
      }
      return;
    }

    const payload = (selection.data && typeof selection.data === 'object') ? selection.data as Record<string, unknown> : {};
    const path = String(payload.path || '').trim();
    const name = String(payload.name || '').trim();
    if (!path) {
      message.error(t('sidebar.message.sql_directory_path_invalid'));
      return;
    }

    const directoryId = buildExternalSQLDirectoryId('', '', path);
    const nextDirectory: ExternalSQLDirectory = {
      id: directoryId,
      name: name || path.split(/[\\/]/).filter(Boolean).pop() || t('sidebar.sql_directory.default_name'),
      path,
      createdAt: Date.now(),
    };
    saveExternalSQLDirectory(nextDirectory);

    const nextDirectories = [
      ...externalSQLDirectories.filter((item) => item.path.replace(/\\/g, '/').toLowerCase() !== path.replace(/\\/g, '/').toLowerCase()),
      nextDirectory,
    ];
    setExpandedKeys((prev) => Array.from(new Set([...prev, 'external-sql-root'])));
    setAutoExpandParent(false);
    await refreshGlobalExternalSQLRootNode(false, nextDirectories);
    message.success(t('sidebar.message.external_sql_directory_added'));
  };

  const handleRemoveExternalSQLDirectory = async (node: any) => {
    const directoryId = String(node?.dataRef?.id || '').trim();
    if (!directoryId) {
      message.error(t('sidebar.message.external_sql_directory_not_found'));
      return;
    }
    deleteExternalSQLDirectory(directoryId);
    const nextDirectories = externalSQLDirectories.filter((item) => item.id !== directoryId);
    await refreshGlobalExternalSQLRootNode(false, nextDirectories);
    message.success(t('sidebar.message.external_sql_directory_removed'));
  };

  const handleRefreshExternalSQLDirectory = async (node: any) => {
    void node;
    await refreshGlobalExternalSQLRootNode(true);
    message.success(t('sidebar.message.external_sql_directory_refreshed'));
  };

  const cancelSQLFileExecution = () => {
    CancelSQLFileExecution(sqlFileExecState.jobId);
    setSqlFileExecState(prev => ({ ...prev, status: 'cancelled' }));
  };

  const closeSQLFileExecutionModal = () => {
    setSqlFileExecState(prev => ({ ...prev, open: false }));
  };

  return {
    handleRunSQLFile,
    handleOpenSQLFileFromToolbar,
    openExternalSQLFile,
    openCreateExternalSQLFileModal,
    openRenameExternalSQLFileModal,
    openCreateExternalSQLDirectoryModal,
    openRenameExternalSQLDirectoryModal,
    handleExternalSQLFileModalOk,
    handleDeleteExternalSQLFile,
    handleDeleteExternalSQLDirectory,
    handleAddExternalSQLDirectory,
    handleRemoveExternalSQLDirectory,
    handleRefreshExternalSQLDirectory,
    externalSQLFileModalProps: {
      open: isExternalSQLFileModalOpen,
      mode: externalSQLFileModalMode,
      form: externalSQLFileForm,
      onOk: handleExternalSQLFileModalOk,
      onCancel: closeExternalSQLFileModal,
    },
    sqlFileExecutionModalProps: {
      state: sqlFileExecState,
      onCancelExecution: cancelSQLFileExecution,
      onClose: closeSQLFileExecutionModal,
    },
  };
};
