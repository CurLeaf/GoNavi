import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPrintableInputFallback } from './MonacoEditor';

class FakeHTMLElement {
  isConnected = true;

  contains(target: unknown): boolean {
    return target === this;
  }
}

class FakeTextAreaElement extends FakeHTMLElement {
  private listeners = new Map<string, Set<(event: InputEvent) => void>>();

  addEventListener(type: string, listener: (event: InputEvent) => void): void {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: InputEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchPrintableBeforeInput(text: string, defaultPrevented = false): void {
    const event = {
      data: text,
      inputType: 'insertText',
      isComposing: false,
      defaultPrevented,
    } as InputEvent;
    this.listeners.get('beforeinput')?.forEach((listener) => listener(event));
  }
}

describe('MonacoEditor printable input fallback', () => {
  let editorDomNode: FakeHTMLElement & { querySelector: () => FakeTextAreaElement };
  let input: FakeTextAreaElement;
  let value: string;
  let position: { lineNumber: number; column: number };
  let modelContentListener: (() => void) | null;
  let editor: any;

  beforeEach(() => {
    vi.useFakeTimers();
    input = new FakeTextAreaElement();
    editorDomNode = Object.assign(new FakeHTMLElement(), {
      contains: (target: unknown) => target === editorDomNode || target === input,
      querySelector: () => input,
    });
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement);
    vi.stubGlobal('document', { activeElement: input });
    vi.stubGlobal('window', { setTimeout, clearTimeout });

    value = '';
    position = { lineNumber: 1, column: 1 };
    modelContentListener = null;
    const offsetAt = (target: { lineNumber: number; column: number }) => (
      Math.max(0, Math.min(value.length, Number(target.column || 1) - 1))
    );
    const positionAt = (offset: number) => ({
      lineNumber: 1,
      column: Math.max(1, Math.min(value.length, offset) + 1),
    });
    editor = {
      getDomNode: () => editorDomNode,
      getSelection: () => ({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }),
      getValue: () => value,
      getModel: () => ({
        getOffsetAt: offsetAt,
        getPositionAt: positionAt,
      }),
      getPosition: () => position,
      getOption: () => false,
      trigger: vi.fn((_source: string, _command: string, payload: { text: string }) => {
        value += payload.text;
        position = { lineNumber: 1, column: position.column + payload.text.length };
      }),
      executeEdits: vi.fn((_source: string, edits: Array<{ range: any; text: string }>) => {
        for (const edit of edits) {
          const startOffset = offsetAt({
            lineNumber: edit.range.startLineNumber,
            column: edit.range.startColumn,
          });
          const endOffset = offsetAt({
            lineNumber: edit.range.endLineNumber,
            column: edit.range.endColumn,
          });
          value = value.slice(0, startOffset) + edit.text + value.slice(endOffset);
        }
      }),
      setPosition: vi.fn((nextPosition: { lineNumber: number; column: number }) => {
        position = nextPosition;
      }),
      onDidChangeModelContent: vi.fn((listener: () => void) => {
        modelContentListener = listener;
        return { dispose: vi.fn() };
      }),
      onDidDispose: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('coalesces consecutive missing printable input before recovering it once', () => {
    installPrintableInputFallback(editor, {
      editor: { EditorOption: { readOnly: 1 } },
    });

    input.dispatchPrintableBeforeInput('a');
    vi.advanceTimersByTime(30);
    input.dispatchPrintableBeforeInput('b');

    vi.advanceTimersByTime(79);
    expect(editor.trigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(editor.trigger).toHaveBeenCalledTimes(1);
    expect(editor.trigger).toHaveBeenCalledWith(
      'gonavi-printable-input-fallback',
      'type',
      { text: 'ab' },
    );
  });

  it('cancels recovery when Monaco receives the native model change', () => {
    installPrintableInputFallback(editor, {
      editor: { EditorOption: { readOnly: 1 } },
    });

    input.dispatchPrintableBeforeInput('a');
    value = 'a';
    position = { lineNumber: 1, column: 2 };
    modelContentListener?.();
    vi.advanceTimersByTime(200);

    expect(editor.trigger).not.toHaveBeenCalled();
  });

  it('recovers a missing leading character when a later character is committed natively', () => {
    installPrintableInputFallback(editor, {
      editor: { EditorOption: { readOnly: 1 } },
    });

    input.dispatchPrintableBeforeInput('a');
    input.dispatchPrintableBeforeInput('b');
    value = 'b';
    position = { lineNumber: 1, column: 2 };
    modelContentListener?.();

    vi.advanceTimersByTime(80);

    expect(editor.trigger).not.toHaveBeenCalled();
    expect(editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-printable-input-fallback',
      [expect.objectContaining({ text: 'ab' })],
    );
    expect(value).toBe('ab');
    expect(position).toEqual({ lineNumber: 1, column: 3 });
  });

  it('recovers a default-prevented leading character when later input reaches the model', () => {
    installPrintableInputFallback(editor, {
      editor: { EditorOption: { readOnly: 1 } },
    });

    value = 'SELECT * FROM person';
    position = { lineNumber: 1, column: value.length + 1 };
    input.dispatchPrintableBeforeInput('s', true);
    input.dispatchPrintableBeforeInput('f');
    value = 'SELECT * FROM personf';
    position = { lineNumber: 1, column: value.length + 1 };
    modelContentListener?.();

    vi.advanceTimersByTime(80);

    expect(editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-printable-input-fallback',
      [expect.objectContaining({ text: 'sf' })],
    );
    expect(value).toBe('SELECT * FROM personsf');
    expect(position).toEqual({ lineNumber: 1, column: value.length + 1 });
  });

  it('settles the previous missing input before buffering text after a cursor move', () => {
    installPrintableInputFallback(editor, {
      editor: { EditorOption: { readOnly: 1 } },
    });

    value = 'xy';
    position = { lineNumber: 1, column: 2 };
    input.dispatchPrintableBeforeInput('a');
    position = { lineNumber: 1, column: 3 };
    input.dispatchPrintableBeforeInput('b');

    vi.advanceTimersByTime(80);

    expect(editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-printable-input-fallback',
      [expect.objectContaining({ text: 'a' })],
    );
    expect(editor.trigger).toHaveBeenCalledWith(
      'gonavi-printable-input-fallback',
      'type',
      { text: 'b' },
    );
    expect(value).toBe('xayb');
    expect(position).toEqual({ lineNumber: 1, column: 5 });
  });
});
