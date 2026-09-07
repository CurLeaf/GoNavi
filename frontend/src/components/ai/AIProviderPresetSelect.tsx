import React from 'react';
import { Select } from 'antd';

import AIProviderLogo from './AIProviderLogo';

interface PresetOption {
  key: string;
  label: string;
}

interface AIProviderPresetSelectProps {
  value: string;
  presets: PresetOption[];
  canSelect: (preset: PresetOption) => boolean;
  disabled?: boolean;
  dark?: boolean;
  builtinLabel: string;
  partnerLabel: string;
  partnerEmpty: string;
  ariaLabel: string;
  onChange: (presetKey: string) => void;
}

const AIProviderPresetSelect: React.FC<AIProviderPresetSelectProps> = ({
  value, presets, canSelect, disabled, dark, builtinLabel, partnerLabel, partnerEmpty, ariaLabel, onChange,
}) => (
  <Select
    className="gonavi-ai-provider-preset-select"
    aria-label={ariaLabel}
    size="middle"
    value={value}
    disabled={disabled}
    popupMatchSelectWidth={false}
    classNames={{ popup: { root: 'gonavi-ai-provider-preset-dropdown' } }}
    optionLabelProp="label"
    options={presets.map((preset) => ({
      value: preset.key,
      label: preset.label,
      disabled: !canSelect(preset) && preset.key !== value,
    }))}
    optionRender={(option) => (
      <span className="gonavi-ai-provider-preset-option">
        <AIProviderLogo presetKey={String(option.value)} label={String(option.label)} dark={dark} />
        <span>{option.label}</span>
      </span>
    )}
    labelRender={(props) => (
      <span className="gonavi-ai-provider-preset-option">
        <AIProviderLogo presetKey={String(props.value)} label={String(props.label)} dark={dark} />
        <span>{props.label}</span>
      </span>
    )}
    popupRender={(menu) => (
      <div className="gonavi-ai-provider-preset-dropdown-grid">
        <div className="gonavi-ai-provider-preset-col">
          <div className="gonavi-ai-provider-preset-col-title">{builtinLabel}</div>
          {menu}
        </div>
        <div className="gonavi-ai-provider-preset-col is-partner">
          <div className="gonavi-ai-provider-preset-col-title">{partnerLabel}</div>
          <div className="gonavi-ai-provider-preset-empty">{partnerEmpty}</div>
        </div>
      </div>
    )}
    onChange={(key) => { if (presets.some((preset) => preset.key === key && (canSelect(preset) || preset.key === value))) onChange(key); }}
  />
);

export default AIProviderPresetSelect;
