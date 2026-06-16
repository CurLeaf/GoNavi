import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { OverlayWorkbenchTheme } from '../../../utils/overlayWorkbenchTheme';
import { normalizeAiMarkdown } from '../../../utils/aiMarkdown';
import { AIMessageCodeBlock } from './AIMessageCodeBlock';

const remarkPlugins = [remarkGfm];

interface AIMessageMarkdownProps {
  content: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  activeConnectionConfig?: any;
  activeConnectionId?: string;
  activeDbName?: string;
}

export const AIMessageMarkdown: React.FC<AIMessageMarkdownProps> = React.memo(({
  content,
  darkMode,
  overlayTheme,
  activeConnectionConfig,
  activeConnectionId,
  activeDbName,
}) => {
  const normalizedContent = React.useMemo(() => normalizeAiMarkdown(content), [content]);
  const components = React.useMemo(() => ({
    code({ inline, className, children }: any) {
      return (
        <AIMessageCodeBlock
          inline={inline}
          className={className}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          activeConnectionConfig={activeConnectionConfig}
          activeConnectionId={activeConnectionId}
          activeDbName={activeDbName}
        >
          {children}
        </AIMessageCodeBlock>
      );
    },
  }), [darkMode, overlayTheme, activeConnectionConfig, activeConnectionId, activeDbName]);

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {normalizedContent}
    </ReactMarkdown>
  );
});
