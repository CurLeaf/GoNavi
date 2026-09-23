import type { TitleBarQuickAction } from '../TitleBarQuickActions';

export interface TitlebarDataActionLabels {
  syncTitle: string;
  syncDescription: string;
  compareTitle: string;
  compareDescription: string;
}

export interface TitlebarDataActionHandlers {
  onSync: () => void;
  onCompare: () => void;
}

/** Title-bar entries for cross-source work. Batch and import stay on object menus. */
export const buildTitlebarDataActions = (
  labels: TitlebarDataActionLabels,
  handlers: TitlebarDataActionHandlers,
): TitleBarQuickAction[] => [
  {
    key: 'sync',
    label: labels.syncTitle,
    tooltip: labels.syncDescription,
    onClick: handlers.onSync,
  },
  {
    key: 'compare',
    label: labels.compareTitle,
    tooltip: labels.compareDescription,
    onClick: handlers.onCompare,
  },
];
