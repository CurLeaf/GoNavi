import { describe, expect, it, vi } from 'vitest';

import {
  canRecordShortcutForAction,
  DEFAULT_SHORTCUT_OPTIONS,
  SHORTCUT_ACTION_META,
  SHORTCUT_ACTION_ORDER,
  type ShortcutBinding,
} from './shortcuts';
import {
  consumeAIChatSendShortcutOnKeyDown,
  getAIChatSendShortcutLabel,
  shouldSendAIChatOnKeyDown,
} from './aiChatSendShortcut';

const binding = (combo: string, enabled = true): ShortcutBinding => ({ combo, enabled });

describe('aiChatSendShortcut', () => {
  it('registers AI chat send in the shared shortcut center with Enter default', () => {
    expect(SHORTCUT_ACTION_ORDER).toContain('sendAIChatMessage');
    expect(DEFAULT_SHORTCUT_OPTIONS.sendAIChatMessage).toEqual({ combo: 'Enter', enabled: true });
    expect(SHORTCUT_ACTION_META.sendAIChatMessage).toMatchObject({
      label: 'AI 聊天发送',
      allowInEditable: true,
      allowWithoutModifier: true,
      scope: 'aiComposer',
      requiredKey: 'Enter',
      disallowShift: true,
    });
  });

  it('allows recording only single-modifier Enter-based AI send shortcuts', () => {
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Enter')).toBe(true);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Meta+Enter')).toBe(true);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Ctrl+Enter')).toBe(true);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Alt+Enter')).toBe(true);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'A')).toBe(false);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Shift+Enter')).toBe(false);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Ctrl+Shift+Enter')).toBe(false);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Ctrl+Alt+Enter')).toBe(false);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Ctrl+Meta+Enter')).toBe(false);
    expect(canRecordShortcutForAction('sendAIChatMessage', 'Meta+Alt+Enter')).toBe(false);
  });

  it('keeps modifier requirements for global shortcuts', () => {
    expect(canRecordShortcutForAction('runQuery', 'Enter')).toBe(false);
    expect(canRecordShortcutForAction('runQuery', 'Ctrl+Enter')).toBe(true);
  });

  it('sends on the configured Enter shortcut but never during composition or Shift+Enter', () => {
    expect(shouldSendAIChatOnKeyDown(binding('Enter'), { key: 'Enter' })).toBe(true);
    expect(shouldSendAIChatOnKeyDown(binding('Enter'), { key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Enter'), { key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Enter'), { key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Enter'), { key: 'a' })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Enter', false), { key: 'Enter' })).toBe(false);
  });

  it('matches recorded Cmd or Ctrl Enter shortcuts', () => {
    expect(shouldSendAIChatOnKeyDown(binding('Meta+Enter'), { key: 'Enter' })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Meta+Enter'), { key: 'Enter', metaKey: true })).toBe(true);
    expect(shouldSendAIChatOnKeyDown(binding('Meta+Enter'), { key: 'Enter', ctrlKey: true })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Ctrl+Enter'), { key: 'Enter', ctrlKey: true })).toBe(true);
    expect(shouldSendAIChatOnKeyDown(binding('Ctrl+Enter'), { key: 'Enter', metaKey: true })).toBe(false);
    expect(shouldSendAIChatOnKeyDown(binding('Ctrl+Enter'), { key: 'Enter', ctrlKey: true, isComposing: true })).toBe(false);
  });

  it('does not allow Shift to become an AI send shortcut even if a stale binding exists', () => {
    expect(shouldSendAIChatOnKeyDown(binding('Shift+Enter'), { key: 'Enter', shiftKey: true })).toBe(false);
    expect(getAIChatSendShortcutLabel(binding('Meta+Enter'))).toBe('Meta+Enter 发送');
    expect(getAIChatSendShortcutLabel(binding('Enter', false))).toBe('快捷键发送已关闭');
  });

  it('stops propagation after consuming the configured AI send shortcut', () => {
    const event = {
      key: 'Enter',
      metaKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const onSend = vi.fn();

    expect(consumeAIChatSendShortcutOnKeyDown(binding('Meta+Enter'), event, onSend)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
