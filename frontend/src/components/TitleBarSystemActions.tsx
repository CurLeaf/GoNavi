import React from 'react';
import { Button, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

type TitleBarSystemActionsProps = {
  settingsLabel: string;
  onOpenSettings: () => void;
};

const TitleBarSystemActions: React.FC<TitleBarSystemActionsProps> = ({
  settingsLabel,
  onOpenSettings,
}) => (
  <div
    className="gn-v2-titlebar-system-actions"
    data-titlebar-system-actions="true"
    data-no-titlebar-toggle="true"
    role="toolbar"
    aria-label={settingsLabel}
    onDoubleClick={(event) => event.stopPropagation()}
  >
    <Tooltip title={settingsLabel} placement="bottom" mouseEnterDelay={0.35}>
      <Button
        size="small"
        type="text"
        className="gn-v2-titlebar-system-action"
        icon={<SettingOutlined />}
        aria-label={settingsLabel}
        data-sidebar-settings-action="true"
        data-titlebar-settings-action="true"
        onClick={onOpenSettings}
      />
    </Tooltip>
  </div>
);

export default TitleBarSystemActions;
