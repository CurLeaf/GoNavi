import { describe, expect, it } from 'vitest';

import { applyNoAutoCapAttributes, applyNoAutoCapAttributesWithin, noAutoCapInputProps } from './inputAutoCap';

describe('inputAutoCap', () => {
  it('exports input props that disable auto capitalization and correction', () => {
    expect(noAutoCapInputProps).toEqual({
      autoCapitalize: 'none',
      autoCorrect: 'off',
      spellCheck: false,
    });
  });

  it('applies lowercase DOM attributes to inputs and textareas', () => {
    const inputAttributes: Record<string, string> = {};
    const textareaAttributes: Record<string, string> = {};
    const input = {
      tagName: 'INPUT',
      setAttribute: (key: string, value: string) => {
        inputAttributes[key] = value;
      },
    } as unknown as Element;
    const textarea = {
      tagName: 'TEXTAREA',
      setAttribute: (key: string, value: string) => {
        textareaAttributes[key] = value;
      },
    } as unknown as Element;

    applyNoAutoCapAttributes(input);
    applyNoAutoCapAttributes(textarea);

    expect(inputAttributes.autocapitalize).toBe('none');
    expect(inputAttributes.autocorrect).toBe('off');
    expect(inputAttributes.spellcheck).toBe('false');
    expect(textareaAttributes.autocapitalize).toBe('none');
    expect(textareaAttributes.autocorrect).toBe('off');
    expect(textareaAttributes.spellcheck).toBe('false');
  });

  it('applies no-auto-cap attributes to all nested inputs and textareas within a container', () => {
    const inputAttributes: Record<string, string> = {};
    const textareaAttributes: Record<string, string> = {};
    const input = {
      tagName: 'INPUT',
      setAttribute: (key: string, value: string) => {
        inputAttributes[key] = value;
      },
    } as unknown as Element;
    const textarea = {
      tagName: 'TEXTAREA',
      setAttribute: (key: string, value: string) => {
        textareaAttributes[key] = value;
      },
    } as unknown as Element;
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe('input, textarea');
        return [input, textarea];
      },
    } as unknown as ParentNode;

    applyNoAutoCapAttributesWithin(root);

    expect(inputAttributes.autocapitalize).toBe('none');
    expect(inputAttributes.autocorrect).toBe('off');
    expect(textareaAttributes.autocapitalize).toBe('none');
    expect(textareaAttributes.autocorrect).toBe('off');
  });
});
