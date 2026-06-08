import React from 'react';
import { Select } from 'antd';
import { DownOutlined } from '@ant-design/icons';

import type { AIProviderConfig } from '../../types';

interface AIChatProviderModelSelectProps {
  activeProvider?: AIProviderConfig | null;
  dynamicModels: string[];
  loadingModels: boolean;
  variant: 'legacy' | 'v2';
  onModelChange: (value: string) => void;
  onFetchModels: () => void;
}

const AIChatProviderModelSelect: React.FC<AIChatProviderModelSelectProps> = ({
  activeProvider,
  dynamicModels,
  loadingModels,
  variant,
  onModelChange,
  onFetchModels,
}) => {
  if (!activeProvider) {
    return null;
  }

  const options = (dynamicModels.length > 0 ? dynamicModels : (activeProvider.models || []))
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((model) => ({ label: model, value: model }));

  const handleOpenChange = (open: boolean) => {
    if (open && options.length === 0) {
      onFetchModels();
    }
  };

  if (variant === 'legacy') {
    return (
      <Select
        size="small"
        variant="filled"
        value={activeProvider.model || undefined}
        onChange={onModelChange}
        onOpenChange={handleOpenChange}
        loading={loadingModels}
        options={options}
        style={{ width: 130, fontSize: 11, background: 'transparent' }}
        styles={{ popup: { root: { minWidth: 200 } } }}
        showSearch
        placeholder="选择模型"
      />
    );
  }

  return (
    <Select
      size="small"
      value={activeProvider.model || undefined}
      onChange={onModelChange}
      onOpenChange={handleOpenChange}
      loading={loadingModels}
      options={options}
      styles={{ popup: { root: { minWidth: 200 } } }}
      placeholder="选择模型"
      className="gn-v2-ai-model-select"
      suffixIcon={<DownOutlined />}
    />
  );
};

export default AIChatProviderModelSelect;
