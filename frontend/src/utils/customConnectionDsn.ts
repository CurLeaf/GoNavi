import { t } from "../i18n";

export interface CustomConnectionDsnState {
  dsnInput: unknown;
  hasStoredSecret?: boolean;
  clearStoredSecret?: boolean;
}

export const getCustomConnectionDsnValidationMessage = ({
  dsnInput,
  hasStoredSecret,
  clearStoredSecret,
}: CustomConnectionDsnState): string | null => {
  const dsnText = String(dsnInput ?? '').trim();
  if (dsnText !== '') {
    return null;
  }
  if (hasStoredSecret && !clearStoredSecret) {
    return null;
  }
  if (hasStoredSecret && clearStoredSecret) {
    return t("connection.modal.validation.custom_dsn_required_when_clearing_saved");
  }
  return t("connection.modal.validation.custom_dsn_required");
};

export const shouldAllowBlankCustomDsn = (state: CustomConnectionDsnState): boolean => (
  getCustomConnectionDsnValidationMessage(state) === null
);
