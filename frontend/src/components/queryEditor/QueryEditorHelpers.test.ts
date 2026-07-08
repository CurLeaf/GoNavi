import { describe, expect, it } from 'vitest';

import {
    resolveOracleLikeDefaultSchemaName,
    resolveOracleLikeExecutionSchemaName,
    resolveOracleLikeLookupSchemaCandidates,
} from './QueryEditorHelpers';

describe('QueryEditorHelpers Oracle-like execution schema', () => {
    it('uses the selected schema when it differs from the login user', () => {
        const config = {
            type: 'oceanbase',
            oceanBaseProtocol: 'oracle',
            user: 'SBDEVREAD',
            database: 'SBDEV',
        };

        expect(resolveOracleLikeDefaultSchemaName(config)).toBe('SBDEVREAD');
        expect(resolveOracleLikeExecutionSchemaName(config, 'SBDEV')).toBe('SBDEVREAD');
        expect(resolveOracleLikeLookupSchemaCandidates(config, 'SBDEV')).toEqual(['SBDEVREAD', 'SBDEV']);
    });

    it('keeps the login user schema when the selected schema is the same owner', () => {
        const config = {
            type: 'oracle',
            user: 'APP_OWNER',
            database: 'ORCLPDB1',
        };

        expect(resolveOracleLikeExecutionSchemaName(config, 'APP_OWNER')).toBe('APP_OWNER');
        expect(resolveOracleLikeLookupSchemaCandidates(config, 'APP_OWNER')).toEqual(['APP_OWNER']);
    });
});
