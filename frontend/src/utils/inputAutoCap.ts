export const noAutoCapInputProps = {
  autoCapitalize: 'none' as const,
  autoCorrect: 'off' as const,
  spellCheck: false,
};

export const applyNoAutoCapAttributes = (element: Element) => {
  const tagName = String((element as Element | null)?.tagName || '').toUpperCase();
  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
    return;
  }

  element.setAttribute('autocapitalize', 'none');
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('spellcheck', 'false');
};

export const applyNoAutoCapAttributesWithin = (root: ParentNode | null | undefined) => {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }

  root.querySelectorAll('input, textarea').forEach((element) => {
    applyNoAutoCapAttributes(element);
  });
};
