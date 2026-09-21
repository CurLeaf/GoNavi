import { describe, expect, it } from 'vitest';

import {
  createDataSyncWorkbenchTranslate,
  dataSyncValidationIssueText,
} from './text';

describe('dataSyncValidationIssueText backend diagnostics', () => {
  const t = createDataSyncWorkbenchTranslate('zh-CN');

  it('appends the backend diagnostic for definition_invalid', () => {
    // definition_invalid wraps every ValidateDefinition failure, including Cron
    // field count, so dropping message left users unable to locate the fault.
    expect(
      dataSyncValidationIssueText(
        {
          code: 'definition_invalid',
          message:
            'cronExpression must contain five fields: minute hour day month weekday',
        },
        t,
      ),
    ).toBe(
      '任务定义无效，请检查必填项、对象映射和执行策略。 cronExpression must contain five fields: minute hour day month weekday',
    );
  });

  it('keeps localized Cron field-count text without a backend message', () => {
    expect(
      dataSyncValidationIssueText({ code: 'cron_expression_field_count' }, t),
    ).toBe('Cron 表达式必须是 5 段：分 时 日 月 周，不要包含秒。');
  });
});
