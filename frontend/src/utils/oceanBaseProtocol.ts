import { t as catalogTranslate } from '../i18n/catalog';

export type OceanBaseProtocol = 'mysql' | 'oracle';
type OceanBaseProtocolTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

export const OCEANBASE_PROTOCOL_PARAM_KEYS = [
  'protocol',
  'oceanBaseProtocol',
  'oceanbaseProtocol',
  'tenantMode',
  'compatMode',
  'mode',
];

type OceanBaseProtocolResolution = {
  protocol?: OceanBaseProtocol;
  unsupportedValue?: string;
  unsupportedKey?: string;
};

const normalizeToken = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const UNSUPPORTED_PROTOCOL_KEY = 'connection.oceanbase.error.unsupported_protocol';

const translateWithFallback = (
  translate: OceanBaseProtocolTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => {
  if (!translate) {
    return fallback;
  }
  const translated = translate(key, params);
  return translated && translated !== key ? translated : fallback;
};

export const normalizeOceanBaseProtocol = (value: unknown): OceanBaseProtocol | undefined => {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'oracle' || normalized === 'oracle-mode' || normalized === 'oracle_mode' || normalized === 'oboracle') {
    return 'oracle';
  }
  if (normalized === 'mysql' || normalized === 'mysql-compatible' || normalized === 'mysql_compatible' || normalized === 'mysql-mode' || normalized === 'mysql_mode' || normalized === 'obmysql') {
    return 'mysql';
  }
  return undefined;
};

export const isUnsupportedOceanBaseProtocolValue = (value: unknown): boolean => {
  const normalized = normalizeToken(value);
  return normalized !== '' && !normalizeOceanBaseProtocol(normalized);
};

export const describeUnsupportedOceanBaseProtocol = (
  value: unknown,
  translate?: OceanBaseProtocolTranslator,
): string => {
  const raw = String(value ?? '').trim();
  return translateWithFallback(
    translate,
    UNSUPPORTED_PROTOCOL_KEY,
    catalogTranslate('en-US', UNSUPPORTED_PROTOCOL_KEY, { value: raw }),
    { value: raw },
  );
};

export const resolveOceanBaseProtocolFromQueryText = (raw: unknown): OceanBaseProtocolResolution => {
  let text = String(raw ?? '').trim();
  if (!text) {
    return {};
  }
  const queryStart = text.indexOf('?');
  if (queryStart >= 0) {
    text = text.slice(queryStart + 1);
  }
  const hashStart = text.indexOf('#');
  if (hashStart >= 0) {
    text = text.slice(0, hashStart);
  }
  const params = new URLSearchParams(text.replace(/^[?&]+/, ''));
  for (const key of OCEANBASE_PROTOCOL_PARAM_KEYS) {
    const value = params.get(key);
    if (value == null || String(value).trim() === '') {
      continue;
    }
    const protocol = normalizeOceanBaseProtocol(value);
    if (protocol) {
      return { protocol };
    }
    return { unsupportedValue: value, unsupportedKey: key };
  }
  return {};
};

export const resolveOceanBaseProtocolFromConfig = (config: Record<string, unknown>): OceanBaseProtocol => {
  const paramsProtocol = resolveOceanBaseProtocolFromQueryText(config.connectionParams);
  const uriProtocol = resolveOceanBaseProtocolFromQueryText(config.uri);

  if (Object.prototype.hasOwnProperty.call(config, 'oceanBaseProtocol')) {
    const value = config.oceanBaseProtocol;
    const protocol = normalizeOceanBaseProtocol(value);
    if (isUnsupportedOceanBaseProtocolValue(value)) {
      throw new Error(describeUnsupportedOceanBaseProtocol(value));
    }
    if (paramsProtocol.unsupportedValue) {
      throw new Error(describeUnsupportedOceanBaseProtocol(paramsProtocol.unsupportedValue));
    }
    if (uriProtocol.unsupportedValue) {
      throw new Error(describeUnsupportedOceanBaseProtocol(uriProtocol.unsupportedValue));
    }
    if (protocol) {
      return protocol;
    }
  }

  if (paramsProtocol.unsupportedValue) {
    throw new Error(describeUnsupportedOceanBaseProtocol(paramsProtocol.unsupportedValue));
  }
  if (paramsProtocol.protocol) {
    return paramsProtocol.protocol;
  }

  if (uriProtocol.unsupportedValue) {
    throw new Error(describeUnsupportedOceanBaseProtocol(uriProtocol.unsupportedValue));
  }
  return uriProtocol.protocol || 'mysql';
};

export const resolveOceanBaseProtocolForDialect = (value: unknown): OceanBaseProtocol => (
  normalizeOceanBaseProtocol(value) || 'mysql'
);
