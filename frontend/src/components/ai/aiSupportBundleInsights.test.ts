import { describe, expect, it } from 'vitest';

import { buildAISupportBundleSnapshot } from './aiSupportBundleInsights';

describe('aiSupportBundleInsights', () => {
  it('uses the provided translator for support bundle wrapper copy', () => {
    const snapshot = buildAISupportBundleSnapshot({
      translate: (key) => ({
        'ai_chat.inspection.support_bundle.message.ready': 'translated support bundle ready',
        'ai_chat.inspection.support_bundle.privacy.note': 'translated privacy note',
      })[key] || key,
    });

    expect(snapshot.message).toBe('translated support bundle ready');
    expect(snapshot.privacy.note).toBe('translated privacy note');
  });
});
