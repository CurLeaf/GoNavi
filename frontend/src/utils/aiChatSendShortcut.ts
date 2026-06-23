import { DEFAULT_SHORTCUT_OPTIONS, getShortcutDisplayLabel, isImeComposingKeyEvent, isShortcutMatch, type ShortcutPlatform, type ShortcutPlatformBinding } from './shortcuts';

export interface AIChatSendShortcutKeyEventLike {
  key?: string;
  keyCode?: number;
  which?: number;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
  };
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export const getAIChatSendShortcutLabel = (
  binding: ShortcutPlatformBinding | undefined,
  platform: ShortcutPlatform = 'windows',
): string => {
  if (binding?.enabled === false) {
    return '快捷键发送已关闭';
  }
  const combo = binding?.combo || DEFAULT_SHORTCUT_OPTIONS.sendAIChatMessage.windows.combo;
  return `${getShortcutDisplayLabel(combo, platform)} 发送`;
};

export const shouldSendAIChatOnKeyDown = (
  binding: ShortcutPlatformBinding | undefined,
  event: AIChatSendShortcutKeyEventLike,
): boolean => {
  if (!binding?.enabled) {
    return false;
  }
  if (event.shiftKey || isImeComposingKeyEvent(event as KeyboardEvent)) {
    return false;
  }
  return isShortcutMatch(event as KeyboardEvent, binding.combo);
};

export const consumeAIChatSendShortcutOnKeyDown = (
  binding: ShortcutPlatformBinding | undefined,
  event: AIChatSendShortcutKeyEventLike,
  onSend: () => void,
): boolean => {
  if (!shouldSendAIChatOnKeyDown(binding, event)) {
    return false;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  onSend();
  return true;
};
