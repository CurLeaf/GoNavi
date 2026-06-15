import { getCurrentLanguage, t, type SupportedLanguage } from '../i18n';

export const getDriverLocalImportButtonLabel = (language?: SupportedLanguage | string) =>
  t('driver_manager.action.import_package', undefined, language ?? getCurrentLanguage());

export const getDriverLocalImportDirectoryHelp = (language?: SupportedLanguage | string) =>
  t('driver_manager.import.directory_help', undefined, language ?? getCurrentLanguage());

export const getDriverLocalImportSingleFileHelp = (language?: SupportedLanguage | string) =>
  t('driver_manager.import.single_file_help', undefined, language ?? getCurrentLanguage());

export const getCustomConnectionDriverHelp = (language?: SupportedLanguage | string) =>
  t('driver.guidance.customConnectionDriverHelp', undefined, language ?? getCurrentLanguage());
