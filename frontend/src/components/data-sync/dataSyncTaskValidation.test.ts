import { describe, expect, it } from 'vitest';

import {
  createDataSyncTableMapping,
  createDataSyncTaskDraft,
  reviseDataSyncTask,
  validateDataSyncTask,
} from './model';

const configuredReconcileTask = () => {
  const base = createDataSyncTaskDraft({ id: 'task-cron', kind: 'reconcile' });
  return reviseDataSyncTask(base, {
    name: 'Orders sync',
    source: { ...base.source, connectionId: 'mysql-prod' },
    target: { ...base.target, connectionId: 'pg-warehouse' },
    mappings: [
      {
        ...createDataSyncTableMapping('map-cron', 'orders', 'ods.orders'),
        keyColumns: ['id'],
      },
    ],
  });
};

const withCron = (expression: string) =>
  reviseDataSyncTask(configuredReconcileTask(), {
    trigger: {
      mode: 'cron',
      expression,
      timezone: 'Asia/Shanghai',
      overlap: 'skip',
    },
  });

describe('data sync task Cron validation', () => {
  it('blocks a Cron expression the scheduler cannot parse on the trigger stage', () => {
    // Six-field (with seconds) used to surface as definition_invalid on endpoints.
    const seconds = validateDataSyncTask(withCron('0 0 3 * * *'));
    expect(
      seconds.find((item) => item.code === 'cron_expression_field_count'),
    ).toMatchObject({ severity: 'blocker', stage: 'trigger' });
    expect(seconds.every((item) => item.stage !== 'endpoints')).toBe(true);

    expect(validateDataSyncTask(withCron('60 3 * * *')).map((item) => item.code))
      .toContain('cron_expression_invalid');

    expect(validateDataSyncTask(withCron('0 3 * * *'))).toEqual([]);
  });

  it('still requires an expression and timezone for Cron triggers', () => {
    expect(
      validateDataSyncTask(withCron('')).map((item) => item.code),
    ).toContain('cron_expression_required');

    const missingTimezone = reviseDataSyncTask(withCron('0 3 * * *'), {
      trigger: {
        mode: 'cron',
        expression: '0 3 * * *',
        timezone: '  ',
        overlap: 'skip',
      },
    });
    expect(validateDataSyncTask(missingTimezone).map((item) => item.code)).toContain(
      'timezone_required',
    );
  });
});
