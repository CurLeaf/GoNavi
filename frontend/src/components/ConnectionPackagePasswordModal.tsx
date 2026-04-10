import React from 'react';
import { Input, Modal, Typography } from 'antd';

const { Text } = Typography;

export interface ConnectionPackagePasswordModalProps {
  open: boolean;
  title: string;
  password: string;
  error?: string;
  confirmLoading?: boolean;
  confirmText?: string;
  cancelText?: string;
  onPasswordChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConnectionPackagePasswordModal({
  open,
  title,
  password,
  error,
  confirmLoading,
  confirmText = '确认',
  cancelText = '取消',
  onPasswordChange,
  onConfirm,
  onCancel,
}: ConnectionPackagePasswordModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      okText={confirmText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      onOk={onConfirm}
      onCancel={onCancel}
      destroyOnClose={false}
      maskClosable={false}
    >
      <Input.Password
        autoFocus
        value={password}
        placeholder="请输入恢复包密码"
        onChange={(event) => onPasswordChange(event.target.value)}
      />
      {error ? (
        <Text type="danger" style={{ display: 'block', marginTop: 8 }}>
          {error}
        </Text>
      ) : null}
    </Modal>
  );
}
