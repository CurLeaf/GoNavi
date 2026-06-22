import { DEFAULT_SHORTCUT_OPTIONS, getShortcutDisplayLabel, isShortcutMatch, type ShortcutPlatform, type ShortcutPlatformBinding } from './shortcuts';

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

export type AIChatSendShortcutTranslate = (
  key: string,
  params?: Record<string, string>,
) => string;

export const getAIChatSendShortcutLabel = (
  binding: ShortcutPlatformBinding | undefined,
  platform: ShortcutPlatform = 'windows',
  translate?: AIChatSendShortcutTranslate,
): string => {
  if (binding?.enabled === false) {
    return translate?.('ai_chat.input.shortcut.disabled') || 'Shortcut sending disabled';
  }
  const combo = binding?.combo || DEFAULT_SHORTCUT_OPTIONS.sendAIChatMessage.windows.combo;
  const shortcut = getShortcutDisplayLabel(combo, platform);
  return translate?.('ai_chat.input.shortcut.send_with_combo', { shortcut }) || `${shortcut} to send`;
};

export const shouldSendAIChatOnKeyDown = (
  binding: ShortcutPlatformBinding | undefined,
  event: AIChatSendShortcutKeyEventLike,
): boolean => {
  if (!binding?.enabled) {
    return false;
  }
  // Some IMEs report Enter during an active candidate/composition as keyCode 229.
  const isImeCandidateEvent = event.keyCode === 229
    || event.which === 229
    || event.nativeEvent?.keyCode === 229
    || event.nativeEvent?.which === 229;
  if (event.shiftKey || event.isComposing || event.nativeEvent?.isComposing || isImeCandidateEvent) {
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
