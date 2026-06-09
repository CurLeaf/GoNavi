import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { parseMCPCommandDraft } from '../../utils/mcpCommandDraft';
import { formatMCPEnvDraft, parseMCPEnvDraft } from '../../utils/mcpEnvDraft';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import AIMCPServerFormPanel from './AIMCPServerFormPanel';
import AIMCPServerGuidePanel from './AIMCPServerGuidePanel';

interface AIMCPServerCardProps {
  server: AIMCPServerConfig;
  serverTools: AIMCPToolDescriptor[];
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  loading: boolean;
  onChange: (patch: Partial<AIMCPServerConfig>) => void;
  onTest: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export const AIMCPServerCard: React.FC<AIMCPServerCardProps> = ({
  server,
  serverTools,
  cardBg,
  cardBorder,
  inputBg,
  darkMode,
  overlayTheme,
  loading,
  onChange,
  onTest,
  onSave,
  onDelete,
}) => {
  const [rawCommandDraft, setRawCommandDraft] = React.useState('');
  const [envDraft, setEnvDraft] = React.useState(() => formatMCPEnvDraft(server.env));
  const launchPreview = buildMCPLaunchPreview(server.command, server.args);
  const parsedCommandDraft = parseMCPCommandDraft(rawCommandDraft);
  const parsedEnvDraft = parseMCPEnvDraft(envDraft);

  React.useEffect(() => {
    setEnvDraft(formatMCPEnvDraft(server.env));
  }, [server.id]);

  const handleApplyCommandDraft = () => {
    if (!parsedCommandDraft.ok || !parsedCommandDraft.draft) {
      return;
    }
    setEnvDraft(formatMCPEnvDraft(parsedCommandDraft.draft.env));
    onChange({
      command: parsedCommandDraft.draft.command,
      args: parsedCommandDraft.draft.args,
      env: parsedCommandDraft.draft.env,
    });
  };

  const handleEnvDraftChange = (nextValue: string) => {
    setEnvDraft(nextValue);
    onChange({ env: parseMCPEnvDraft(nextValue).env });
  };

  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AIMCPServerGuidePanel
        cardBorder={cardBorder}
        inputBg={inputBg}
        darkMode={darkMode}
        overlayTheme={overlayTheme}
        rawCommandDraft={rawCommandDraft}
        parsedCommandDraft={parsedCommandDraft}
        onApplyCommandDraft={handleApplyCommandDraft}
        onRawCommandDraftChange={setRawCommandDraft}
      />
      <AIMCPServerFormPanel
        server={server}
        serverTools={serverTools}
        launchPreview={launchPreview}
        envDraft={envDraft}
        parsedEnvDraft={parsedEnvDraft}
        cardBorder={cardBorder}
        inputBg={inputBg}
        darkMode={darkMode}
        overlayTheme={overlayTheme}
        loading={loading}
        onChange={onChange}
        onEnvDraftChange={handleEnvDraftChange}
        onTest={onTest}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
};

export default AIMCPServerCard;
