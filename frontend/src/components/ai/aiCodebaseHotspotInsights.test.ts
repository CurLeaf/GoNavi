import { describe, expect, it } from 'vitest';

import { buildCodebaseHotspotSnapshot } from './aiCodebaseHotspotInsights';

describe('aiCodebaseHotspotInsights', () => {
  it('uses the provided translator for user-facing hotspot guidance', () => {
    const snapshot = buildCodebaseHotspotSnapshot({
      keyword: 'QueryEditor',
      minLines: 1000,
      limit: 1,
      translate: (key) => ({
        'ai_chat.inspection.codebase_hotspots.evidence.note': 'translated evidence note',
        'ai_chat.inspection.codebase_hotspots.query_editor.why': 'translated query editor why',
        'ai_chat.inspection.codebase_hotspots.query_editor.preferred_next_slice': 'translated next slice',
        'ai_chat.inspection.codebase_hotspots.query_editor.safe_seam': 'translated safe seam',
        'ai_chat.inspection.codebase_hotspots.query_editor.suggested_slice.result_toolbar': 'translated result toolbar',
        'ai_chat.inspection.codebase_hotspots.query_editor.verification.browser_smoke': 'translated browser smoke',
        'ai_chat.inspection.codebase_hotspots.next_action.pick_ready_slice': 'translated next action',
      })[key] || key,
    });

    expect(snapshot.evidence.note).toBe('translated evidence note');
    expect(snapshot.hotspots[0]?.why).toBe('translated query editor why');
    expect(snapshot.hotspots[0]?.preferredNextSlice).toBe('translated next slice');
    expect(snapshot.hotspots[0]?.safeSeam).toBe('translated safe seam');
    expect(snapshot.hotspots[0]?.suggestedSlices).toContain('translated result toolbar');
    expect(snapshot.hotspots[0]?.verificationPlan).toContain('translated browser smoke');
    expect(snapshot.nextActions).toContain('translated next action');
  });
});
