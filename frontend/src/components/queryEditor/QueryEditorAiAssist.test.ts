import { describe, expect, it, vi } from 'vitest';

import {
    buildQueryEditorInlineCompletionMessages,
    buildQueryEditorTextToSqlMessages,
    requestQueryEditorInlineCompletion,
    resolveInlineSqlInsertText,
    resolveQueryEditorAiRuntimeReadiness,
    sanitizeSqlAssistantResponse,
    shouldRequestQueryEditorInlineCompletion,
    type QueryEditorAiService,
} from './QueryEditorAiAssist';

const readyService = (content = 'SELECT * FROM users;'): QueryEditorAiService => ({
    AIGetProviders: vi.fn(async () => [{
        id: 'openai-main',
        type: 'openai' as const,
        name: 'OpenAI',
        apiKey: '',
        hasSecret: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5',
        maxTokens: 2048,
        temperature: 0.2,
    }]),
    AIGetActiveProvider: vi.fn(async () => 'openai-main'),
    AIGetUserPromptSettings: vi.fn(async () => ({
        global: 'Keep answers deterministic.',
        database: 'Prefer readonly SQL.',
    })),
    AIChatSend: vi.fn(async () => ({ success: true, content })),
});

describe('QueryEditorAiAssist', () => {
    it('only requests inline completion in editable SQL context', () => {
        expect(shouldRequestQueryEditorInlineCompletion({
            prefix: 'select',
            suffix: '',
            currentLineBeforeCursor: 'select',
            currentLineAfterCursor: '',
        })).toBe(true);

        expect(shouldRequestQueryEditorInlineCompletion({
            prefix: '-- select',
            suffix: '',
            currentLineBeforeCursor: '-- select',
            currentLineAfterCursor: '',
        })).toBe(false);

        expect(shouldRequestQueryEditorInlineCompletion({
            prefix: "select 'abc",
            suffix: '',
            currentLineBeforeCursor: "select 'abc",
            currentLineAfterCursor: '',
        })).toBe(false);

        expect(shouldRequestQueryEditorInlineCompletion({
            prefix: 'select',
            suffix: ' from users',
            currentLineBeforeCursor: 'select',
            currentLineAfterCursor: ' from users',
        })).toBe(false);
    });

    it('sanitizes fenced SQL and removes duplicated typed prefixes', () => {
        expect(sanitizeSqlAssistantResponse('```sql\nselect * from users;\n```')).toBe('select * from users;');
        expect(sanitizeSqlAssistantResponse('SQL: select count(*) from orders;')).toBe('select count(*) from orders;');

        expect(resolveInlineSqlInsertText('SELECT * FROM users;', 'select')).toBe(' * FROM users;');
        expect(resolveInlineSqlInsertText('from users;', 'select ')).toBe('from users;');
        expect(resolveInlineSqlInsertText('orders', 'select * from')).toBe(' orders');
    });

    it('builds inline and text-to-sql prompts with custom instructions and schema hints', () => {
        const aiContext = {
            connectionName: 'Local MySQL',
            sourceType: 'mysql',
            currentDb: 'shop',
            visibleDbs: ['shop'],
            tables: [{ dbName: 'shop', tableName: 'orders', comment: 'sales orders' }],
            columns: [
                { dbName: 'shop', tableName: 'orders', name: 'id', type: 'bigint' },
                { dbName: 'shop', tableName: 'orders', name: 'amount', type: 'decimal' },
            ],
        };
        const userPromptSettings = {
            global: 'Always use explicit column names.',
            database: 'Readonly by default.',
            jvm: '',
            jvmDiagnostic: '',
        };

        const inlineMessages = buildQueryEditorInlineCompletionMessages({
            aiContext,
            editorSnapshot: {
                prefix: 'select',
                suffix: '',
                currentLineBeforeCursor: 'select',
                currentLineAfterCursor: '',
            },
            userPromptSettings,
        });
        const inlineJoined = inlineMessages.map((message) => message.content).join('\n');
        expect(inlineJoined).toContain('Always use explicit column names.');
        expect(inlineJoined).toContain('shop.orders -- sales orders; columns: id bigint, amount decimal');
        expect(inlineJoined).toContain('<prefix_before_cursor>');

        const textToSqlMessages = buildQueryEditorTextToSqlMessages({
            aiContext,
            editorSnapshot: {
                prefix: '',
                suffix: '',
                currentLineBeforeCursor: '',
                currentLineAfterCursor: '',
            },
            instruction: 'total order amount by day',
            userPromptSettings,
        });
        expect(textToSqlMessages.map((message) => message.content).join('\n')).toContain('total order amount by day');
    });

    it('checks active provider readiness before inline AI requests', async () => {
        const service = readyService('select * from users;');
        const readiness = await resolveQueryEditorAiRuntimeReadiness(service);
        expect(readiness.ready).toBe(true);
        expect(readiness.provider?.model).toBe('gpt-5');

        const insertText = await requestQueryEditorInlineCompletion({
            service,
            aiContext: {
                connectionName: 'Local MySQL',
                sourceType: 'mysql',
                currentDb: 'shop',
                tables: [],
                columns: [],
            },
            editorSnapshot: {
                prefix: 'select',
                suffix: '',
                currentLineBeforeCursor: 'select',
                currentLineAfterCursor: '',
            },
        });
        expect(insertText).toBe(' * from users;');
        expect(service.AIChatSend).toHaveBeenCalledTimes(1);

        const missingProvider = await resolveQueryEditorAiRuntimeReadiness({
            AIChatSend: vi.fn(),
            AIGetProviders: vi.fn(async () => []),
            AIGetActiveProvider: vi.fn(async () => ''),
        });
        expect(missingProvider.ready).toBe(false);
        expect(missingProvider.reason).toBe('provider_missing');
    });
});
