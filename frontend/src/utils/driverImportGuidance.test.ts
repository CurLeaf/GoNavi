import { describe, expect, it } from 'vitest';

import {
  CUSTOM_CONNECTION_DRIVER_HELP,
  DRIVER_LOCAL_IMPORT_BUTTON_LABEL,
  DRIVER_LOCAL_IMPORT_DIRECTORY_HELP,
  DRIVER_LOCAL_IMPORT_SINGLE_FILE_HELP,
} from './driverImportGuidance';

describe('driver import guidance', () => {
  it('keeps local import copy focused on driver packages instead of JDBC jars', () => {
    expect(DRIVER_LOCAL_IMPORT_BUTTON_LABEL).toBe('导入驱动包');
    expect(DRIVER_LOCAL_IMPORT_DIRECTORY_HELP).toContain('导入驱动目录');
    expect(DRIVER_LOCAL_IMPORT_SINGLE_FILE_HELP).toContain('JDBC Jar');
  });

  it('documents custom driver aliases for kingbase and related fallbacks', () => {
    expect(CUSTOM_CONNECTION_DRIVER_HELP).toContain('kingbase8');
    expect(CUSTOM_CONNECTION_DRIVER_HELP).toContain('pgx');
    expect(CUSTOM_CONNECTION_DRIVER_HELP).toContain('open_gauss');
    expect(CUSTOM_CONNECTION_DRIVER_HELP).toContain('oceanbase');
    expect(CUSTOM_CONNECTION_DRIVER_HELP).toContain('JDBC Jar');
  });
});
