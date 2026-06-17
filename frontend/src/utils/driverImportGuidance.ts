import { getCurrentLanguage, t, type SupportedLanguage } from '../i18n';

export const getDriverLocalImportButtonLabel = (language?: SupportedLanguage | string) =>
  t('driver_manager.action.import_package', undefined, language ?? getCurrentLanguage());

export const getDriverLocalImportDirectoryHelp = (language?: SupportedLanguage | string) =>
  t('driver_manager.import.directory_help', undefined, language ?? getCurrentLanguage());

export const getDriverLocalImportSingleFileHelp = (language?: SupportedLanguage | string) =>
  t('driver_manager.import.single_file_help', undefined, language ?? getCurrentLanguage());

const includeCustomDriverRawAliases = (helpText: string): string => {
  let next = String(helpText || '');
  if (!/\bgaussdb\b/i.test(next)) {
    next = next.replace(/\bopengauss\b/i, (match) => `${match}, gaussdb`);
  }
  if (!/gauss_db\/gauss-db/i.test(next)) {
    next = next.replace(/open_gauss\/open-gauss([、,])(\s*)/u, (_match, separator: string, spacing: string) => {
      const gap = separator === ',' ? spacing || ' ' : '';
      return `open_gauss/open-gauss${separator}${gap}gauss_db/gauss-db${separator}${spacing || ''}`;
    });
  }
  return next;
};

export const getCustomConnectionDriverHelp = (language?: SupportedLanguage | string) =>
  includeCustomDriverRawAliases(t('driver.guidance.customConnectionDriverHelp', undefined, language ?? getCurrentLanguage()));
