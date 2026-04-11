import { describe, expect, it } from 'vitest';

import { resolveConnectionSecretDraft } from './connectionSecretDraft';

describe('resolveConnectionSecretDraft', () => {
  it('keeps an existing stored secret when edit form leaves the field blank', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: true,
      valueInput: '',
      clearSecret: false,
    });

    expect(result.value).toBe('');
    expect(result.clearStoredSecret).toBe(false);
    expect(result.keepsStoredSecret).toBe(true);
    expect(result.hasSecretAfterSave).toBe(true);
  });

  it('replaces the stored secret when a new value is entered', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: true,
      valueInput: '  mongodb://demo  ',
      clearSecret: false,
      trimInput: true,
    });

    expect(result.value).toBe('mongodb://demo');
    expect(result.clearStoredSecret).toBe(false);
    expect(result.keepsStoredSecret).toBe(false);
    expect(result.hasSecretAfterSave).toBe(true);
  });

  it('clears the stored secret when explicitly requested', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: true,
      valueInput: '',
      clearSecret: true,
    });

    expect(result.value).toBe('');
    expect(result.clearStoredSecret).toBe(true);
    expect(result.keepsStoredSecret).toBe(false);
    expect(result.hasSecretAfterSave).toBe(false);
  });

  it('prefers a newly entered value over a stale clear toggle', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: true,
      valueInput: 'new-password',
      clearSecret: true,
    });

    expect(result.value).toBe('new-password');
    expect(result.clearStoredSecret).toBe(false);
    expect(result.keepsStoredSecret).toBe(false);
    expect(result.hasSecretAfterSave).toBe(true);
  });

  it('does not emit a clear flag for a brand new blank field', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: false,
      valueInput: '',
      clearSecret: false,
    });

    expect(result.value).toBe('');
    expect(result.clearStoredSecret).toBe(false);
    expect(result.keepsStoredSecret).toBe(false);
    expect(result.hasSecretAfterSave).toBe(false);
  });

  it('supports force clearing stored secrets', () => {
    const result = resolveConnectionSecretDraft({
      hasSecret: true,
      valueInput: 'temporary',
      clearSecret: false,
      forceClear: true,
    });

    expect(result.value).toBe('');
    expect(result.clearStoredSecret).toBe(true);
    expect(result.keepsStoredSecret).toBe(false);
    expect(result.hasSecretAfterSave).toBe(false);
  });
});

