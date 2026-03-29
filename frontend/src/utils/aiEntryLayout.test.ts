import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_UTILITY_ITEM_KEYS,
  resolveAIEntryPlacement,
  resolveAIEdgeHandleAttachment,
  resolveAIEdgeHandleDockStyle,
  resolveAIEdgeHandleStyle,
} from './aiEntryLayout';

describe('ai entry layout', () => {
  it('keeps the sidebar utility group free of the AI entry', () => {
    expect(SIDEBAR_UTILITY_ITEM_KEYS).toEqual(['tools', 'proxy', 'theme', 'about']);
  });

  it('anchors the AI entry to the content edge', () => {
    expect(resolveAIEntryPlacement()).toBe('content-edge');
  });

  it('attaches the closed handle to the content shell', () => {
    expect(resolveAIEdgeHandleAttachment(false)).toBe('content-shell');
  });

  it('attaches the open handle to the panel shell', () => {
    expect(resolveAIEdgeHandleAttachment(true)).toBe('panel-shell');
  });

  it('keeps the closed handle docked on the content edge', () => {
    expect(resolveAIEdgeHandleDockStyle('content-shell')).toMatchObject({
      position: 'absolute',
      top: 16,
      right: 0,
      zIndex: 12,
    });
  });

  it('keeps the open handle outside the panel shell to avoid header overlap', () => {
    expect(resolveAIEdgeHandleDockStyle('panel-shell')).toMatchObject({
      position: 'absolute',
      top: 16,
      right: '100%',
      zIndex: 12,
    });
  });

  it('uses the attached active appearance when the AI panel is open', () => {
    const style = resolveAIEdgeHandleStyle({
      darkMode: true,
      aiPanelVisible: true,
      effectiveUiScale: 1,
    });

    expect(style.color).toBe('#ffd666');
    expect(style.background).toBe('rgba(255,214,102,0.12)');
    expect(style.borderRadius).toBe('10px 0 0 10px');
    expect(style.borderRight).toBe('none');
    expect(style.height).toBe(24);
  });

  it('uses the subdued attached appearance when the AI panel is closed', () => {
    const style = resolveAIEdgeHandleStyle({
      darkMode: false,
      aiPanelVisible: false,
      effectiveUiScale: 1,
    });

    expect(style.color).toBe('rgba(22,32,51,0.82)');
    expect(style.background).toBe('rgba(15,23,42,0.04)');
    expect(style.paddingInline).toBe(8);
    expect(style.borderRadius).toBe('10px 0 0 10px');
  });
});
