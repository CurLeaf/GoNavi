import { isMacLikePlatform } from "../../utils/appearance";
import {
  DEFAULT_SHORTCUT_OPTIONS,
  SHORTCUT_ACTION_META,
  SHORTCUT_ACTION_ORDER,
  getShortcutDisplayLabel,
  getShortcutPlatform,
  resolveShortcutBinding,
  type ShortcutAction,
  type ShortcutOptions,
  type ShortcutPlatform,
} from "../../utils/shortcuts";

interface BuildShortcutSnapshotOptions {
  shortcutOptions?: Partial<ShortcutOptions> | null;
  currentPlatform?: ShortcutPlatform;
  action?: string;
  keyword?: string;
  includeDisabled?: boolean;
  includeAllPlatforms?: boolean;
}

interface ShortcutBindingSnapshot {
  platform: ShortcutPlatform;
  combo: string;
  display: string;
  enabled: boolean;
  defaultCombo: string;
  defaultDisplay: string;
  defaultEnabled: boolean;
  isCustomized: boolean;
}

const normalizeText = (value: unknown): string =>
  String(value || "").trim().toLowerCase();

const buildShortcutBindingSnapshot = (
  shortcutOptions: Partial<ShortcutOptions> | null | undefined,
  action: ShortcutAction,
  platform: ShortcutPlatform,
): ShortcutBindingSnapshot => {
  const current = resolveShortcutBinding(shortcutOptions, action, platform);
  const defaults = resolveShortcutBinding(DEFAULT_SHORTCUT_OPTIONS, action, platform);
  return {
    platform,
    combo: current.combo,
    display: current.enabled ? getShortcutDisplayLabel(current.combo, platform) : "-",
    enabled: current.enabled !== false,
    defaultCombo: defaults.combo,
    defaultDisplay: defaults.enabled ? getShortcutDisplayLabel(defaults.combo, platform) : "-",
    defaultEnabled: defaults.enabled !== false,
    isCustomized:
      current.combo !== defaults.combo || current.enabled !== defaults.enabled,
  };
};

const matchesActionFilter = (
  action: ShortcutAction,
  filter: string,
): boolean => !filter || normalizeText(action) === filter;

const matchesKeywordFilter = (
  searchText: string,
  filter: string,
): boolean => !filter || searchText.includes(filter);

export const buildShortcutSnapshot = ({
  shortcutOptions,
  currentPlatform = getShortcutPlatform(isMacLikePlatform()),
  action,
  keyword,
  includeDisabled = true,
  includeAllPlatforms = true,
}: BuildShortcutSnapshotOptions) => {
  const normalizedAction = normalizeText(action);
  const normalizedKeyword = normalizeText(keyword);

  const actions = SHORTCUT_ACTION_ORDER
    .map((shortcutAction) => {
      const meta = SHORTCUT_ACTION_META[shortcutAction];
      const windowsBinding = buildShortcutBindingSnapshot(
        shortcutOptions,
        shortcutAction,
        "windows",
      );
      const macBinding = buildShortcutBindingSnapshot(
        shortcutOptions,
        shortcutAction,
        "mac",
      );
      const currentBinding =
        currentPlatform === "mac" ? macBinding : windowsBinding;

      if (!includeDisabled && !currentBinding.enabled) {
        return null;
      }
      if (!matchesActionFilter(shortcutAction, normalizedAction)) {
        return null;
      }

      const searchText = normalizeText([
        shortcutAction,
        meta.label,
        meta.description,
        meta.scope || "global",
        currentBinding.combo,
        currentBinding.defaultCombo,
        windowsBinding.combo,
        windowsBinding.defaultCombo,
        macBinding.combo,
        macBinding.defaultCombo,
      ].join(" "));
      if (!matchesKeywordFilter(searchText, normalizedKeyword)) {
        return null;
      }

      return {
        action: shortcutAction,
        label: meta.label,
        description: meta.description,
        scope: meta.scope || "global",
        allowInEditable: meta.allowInEditable === true,
        allowWithoutModifier: meta.allowWithoutModifier === true,
        requiredKey: meta.requiredKey || null,
        disallowShift: meta.disallowShift === true,
        platformOnly: meta.platformOnly || null,
        currentPlatformBinding: currentBinding,
        platforms: includeAllPlatforms
          ? {
              windows: windowsBinding,
              mac: macBinding,
            }
          : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    currentPlatform,
    filters: {
      action: normalizedAction || null,
      keyword: normalizedKeyword || null,
      includeDisabled,
      includeAllPlatforms,
    },
    totalActionCount: SHORTCUT_ACTION_ORDER.length,
    matchedActionCount: actions.length,
    knownActions: SHORTCUT_ACTION_ORDER,
    actions,
  };
};
