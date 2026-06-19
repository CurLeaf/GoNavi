import React from 'react';
import { Checkbox, Form, Input, Space } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { FolderOpenOutlined } from '@ant-design/icons';
import Modal from '../common/ResizableDraggableModal';
import type { SavedConnection, SavedQuery } from '../../types';
import { t } from '../../i18n';
import { noAutoCapInputProps } from '../../utils/inputAutoCap';

type ConnectionTag = {
  id: string;
  name: string;
  connectionIds: string[];
};

type SidebarEntityModalsProps = {
  connections: SavedConnection[];
  connectionTags: ConnectionTag[];
  modalPanelStyle: React.CSSProperties;
  modalSectionStyle: React.CSSProperties;
  modalScrollSectionStyle: React.CSSProperties;
  renderSidebarModalTitle: (icon: React.ReactNode, title: string, description: string) => React.ReactNode;
  isCreateTagModalOpen: boolean;
  setIsCreateTagModalOpen: (open: boolean) => void;
  createTagForm: FormInstance;
  renameViewTarget: any;
  updateConnectionTag: (tag: ConnectionTag) => void;
  addConnectionTag: (tag: ConnectionTag) => void;
  moveConnectionToTag: (connectionId: string, tagId: string) => void;
  isCreateDbModalOpen: boolean;
  setIsCreateDbModalOpen: (open: boolean) => void;
  createDbForm: FormInstance;
  handleCreateDatabase: () => void;
  isCreateSchemaModalOpen: boolean;
  setIsCreateSchemaModalOpen: (open: boolean) => void;
  createSchemaForm: FormInstance;
  createSchemaTarget: any;
  setCreateSchemaTarget: (target: any) => void;
  handleCreateSchema: () => void;
  isRenameSchemaModalOpen: boolean;
  setIsRenameSchemaModalOpen: (open: boolean) => void;
  renameSchemaForm: FormInstance;
  renameSchemaTarget: any;
  setRenameSchemaTarget: (target: any) => void;
  handleRenameSchema: () => void;
  isRenameDbModalOpen: boolean;
  setIsRenameDbModalOpen: (open: boolean) => void;
  renameDbForm: FormInstance;
  renameDbTarget: any;
  setRenameDbTarget: (target: any) => void;
  handleRenameDatabase: () => void;
  isRenameTableModalOpen: boolean;
  setIsRenameTableModalOpen: (open: boolean) => void;
  renameTableForm: FormInstance;
  renameTableTarget: any;
  setRenameTableTarget: (target: any) => void;
  handleRenameTable: () => void;
  isRenameViewModalOpen: boolean;
  setIsRenameViewModalOpen: (open: boolean) => void;
  renameViewForm: FormInstance;
  setRenameViewTarget: (target: any) => void;
  handleRenameView: () => void;
  isRenameSavedQueryModalOpen: boolean;
  setIsRenameSavedQueryModalOpen: (open: boolean) => void;
  renameSavedQueryForm: FormInstance;
  renameSavedQueryTarget: SavedQuery | null;
  setRenameSavedQueryTarget: (target: SavedQuery | null) => void;
  handleRenameSavedQuery: () => void;
};

export const SidebarEntityModals: React.FC<SidebarEntityModalsProps> = ({
  connections,
  connectionTags,
  modalPanelStyle,
  modalSectionStyle,
  modalScrollSectionStyle,
  renderSidebarModalTitle,
  isCreateTagModalOpen,
  setIsCreateTagModalOpen,
  createTagForm,
  renameViewTarget,
  updateConnectionTag,
  addConnectionTag,
  moveConnectionToTag,
  isCreateDbModalOpen,
  setIsCreateDbModalOpen,
  createDbForm,
  handleCreateDatabase,
  isCreateSchemaModalOpen,
  setIsCreateSchemaModalOpen,
  createSchemaForm,
  createSchemaTarget,
  setCreateSchemaTarget,
  handleCreateSchema,
  isRenameSchemaModalOpen,
  setIsRenameSchemaModalOpen,
  renameSchemaForm,
  renameSchemaTarget,
  setRenameSchemaTarget,
  handleRenameSchema,
  isRenameDbModalOpen,
  setIsRenameDbModalOpen,
  renameDbForm,
  renameDbTarget,
  setRenameDbTarget,
  handleRenameDatabase,
  isRenameTableModalOpen,
  setIsRenameTableModalOpen,
  renameTableForm,
  renameTableTarget,
  setRenameTableTarget,
  handleRenameTable,
  isRenameViewModalOpen,
  setIsRenameViewModalOpen,
  renameViewForm,
  setRenameViewTarget,
  handleRenameView,
  isRenameSavedQueryModalOpen,
  setIsRenameSavedQueryModalOpen,
  renameSavedQueryForm,
  renameSavedQueryTarget,
  setRenameSavedQueryTarget,
  handleRenameSavedQuery,
}) => (
  <>
    <Modal
      title={renderSidebarModalTitle(
        <FolderOpenOutlined />,
        renameViewTarget?.type === 'tag' ? t('sidebar.modal.tag.edit_title') : t('sidebar.modal.tag.create_title'),
        renameViewTarget?.type === 'tag' ? t('sidebar.modal.tag.edit_description') : t('sidebar.modal.tag.create_description'),
      )}
      open={isCreateTagModalOpen}
      centered
      styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
      onOk={() => {
        createTagForm.validateFields().then(values => {
          if (renameViewTarget?.type === 'tag') {
            updateConnectionTag({
              ...renameViewTarget.dataRef,
              name: values.name,
              connectionIds: values.connectionIds || [],
            });
            const allOtherTagsIds = connectionTags.filter(tag => tag.id !== renameViewTarget.dataRef.id).flatMap(tag => tag.connectionIds);
            (values.connectionIds || []).forEach((connectionId: string) => {
              if (allOtherTagsIds.includes(connectionId)) {
                moveConnectionToTag(connectionId, renameViewTarget.dataRef.id);
              }
            });
          } else {
            const tagId = Date.now().toString();
            addConnectionTag({
              id: tagId,
              name: values.name,
              connectionIds: values.connectionIds || [],
            });
            (values.connectionIds || []).forEach((connectionId: string) => {
              moveConnectionToTag(connectionId, tagId);
            });
          }
          setIsCreateTagModalOpen(false);
        });
      }}
      onCancel={() => setIsCreateTagModalOpen(false)}
    >
      <Form form={createTagForm} layout="vertical">
        <div style={modalSectionStyle}>
          <Form.Item name="name" label={t('sidebar.field.tag_name')} rules={[{ required: true, message: t('sidebar.validation.tag_name_required') }]}>
            <Input placeholder={t('sidebar.placeholder.tag_name')} />
          </Form.Item>
          <Form.Item name="connectionIds" label={t('sidebar.field.select_connections')} style={{ marginBottom: 0 }}>
            <Checkbox.Group style={{ width: '100%' }}>
              <div style={modalScrollSectionStyle}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {connections.map(conn => (
                    <Checkbox key={conn.id} value={conn.id}>
                      {conn.name} {conn.config.host ? `(${conn.config.host})` : ''}
                    </Checkbox>
                  ))}
                </Space>
              </div>
            </Checkbox.Group>
          </Form.Item>
        </div>
      </Form>
    </Modal>

    <Modal
      title="新建数据库"
      open={isCreateDbModalOpen}
      onOk={handleCreateDatabase}
      onCancel={() => setIsCreateDbModalOpen(false)}
    >
      <Form form={createDbForm} layout="vertical">
        <Form.Item name="name" label="数据库名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={`${t('sidebar.v2_database_menu.new_schema')}${createSchemaTarget?.dataRef?.dbName ? ` (${createSchemaTarget.dataRef.dbName})` : ''}`}
      open={isCreateSchemaModalOpen}
      onOk={handleCreateSchema}
      onCancel={() => {
        setIsCreateSchemaModalOpen(false);
        setCreateSchemaTarget(null);
        createSchemaForm.resetFields();
      }}
    >
      <Form form={createSchemaForm} layout="vertical">
        <Form.Item name="name" label={t('sidebar.field.schema_name')} rules={[{ required: true, message: t('sidebar.validation.schema_name_required') }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={`编辑模式${renameSchemaTarget?.dataRef?.dbName && renameSchemaTarget?.dataRef?.schemaName ? ` (${renameSchemaTarget.dataRef.dbName}.${renameSchemaTarget.dataRef.schemaName})` : ''}`}
      open={isRenameSchemaModalOpen}
      onOk={handleRenameSchema}
      onCancel={() => {
        setIsRenameSchemaModalOpen(false);
        setRenameSchemaTarget(null);
        renameSchemaForm.resetFields();
      }}
    >
      <Form form={renameSchemaForm} layout="vertical">
        <Form.Item name="newName" label="模式名称" rules={[{ required: true, message: '请输入模式名称' }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={renameDbTarget?.dataRef?.dbName ? t('sidebar.modal.rename_database.title', { name: renameDbTarget.dataRef.dbName }) : t('sidebar.menu.rename_database')}
      open={isRenameDbModalOpen}
      onOk={handleRenameDatabase}
      onCancel={() => {
        setIsRenameDbModalOpen(false);
        setRenameDbTarget(null);
        renameDbForm.resetFields();
      }}
    >
      <Form form={renameDbForm} layout="vertical">
        <Form.Item name="newName" label={t('sidebar.field.new_database_name')} rules={[{ required: true, message: t('sidebar.validation.new_database_name_required') }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={`重命名表${renameTableTarget?.dataRef?.tableName ? ` (${renameTableTarget.dataRef.tableName})` : ''}`}
      open={isRenameTableModalOpen}
      onOk={handleRenameTable}
      onCancel={() => {
        setIsRenameTableModalOpen(false);
        setRenameTableTarget(null);
        renameTableForm.resetFields();
      }}
    >
      <Form form={renameTableForm} layout="vertical">
        <Form.Item name="newName" label="新表名" rules={[{ required: true, message: '请输入新表名' }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={`重命名视图${renameViewTarget?.dataRef?.viewName ? ` (${renameViewTarget.dataRef.viewName})` : ''}`}
      open={isRenameViewModalOpen}
      onOk={handleRenameView}
      onCancel={() => {
        setIsRenameViewModalOpen(false);
        setRenameViewTarget(null);
        renameViewForm.resetFields();
      }}
    >
      <Form form={renameViewForm} layout="vertical">
        <Form.Item name="newName" label="新视图名" rules={[{ required: true, message: '请输入新视图名' }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      title={`${t('query_editor.save_modal.rename_title')}${renameSavedQueryTarget?.name ? ` (${renameSavedQueryTarget.name})` : ''}`}
      open={isRenameSavedQueryModalOpen}
      onOk={handleRenameSavedQuery}
      onCancel={() => {
        setIsRenameSavedQueryModalOpen(false);
        setRenameSavedQueryTarget(null);
        renameSavedQueryForm.resetFields();
      }}
      okText={t('query_editor.action.rename_query')}
      cancelText={t('common.cancel')}
    >
      <Form form={renameSavedQueryForm} layout="vertical">
        <Form.Item name="name" label={t('query_editor.save_modal.name_label')} rules={[{ required: true, message: t('query_editor.save_modal.name_required') }]}>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
      </Form>
    </Modal>
  </>
);
