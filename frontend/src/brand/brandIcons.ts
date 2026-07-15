export type BrandIconId =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10';

export type BrandIconDefinition = {
  id: BrandIconId;
  slug: string;
  titleZh: string;
  titleEn: string;
  iconPath: string;
  icon2xPath: string;
  fullPath: string;
  /** Full-bleed macOS Dock tile (opaque, no nested card). */
  dockPath: string;
};

export const DEFAULT_BRAND_ICON_ID: BrandIconId = '02';

export const BRAND_ICONS: BrandIconDefinition[] = [
  {
    id: '01',
    slug: 'database-hug',
    titleZh: '抱库小狗',
    titleEn: 'Database hug',
    iconPath: '/brand-icons/01-database-hug.png',
    icon2xPath: '/brand-icons/01-database-hug@2x.png',
    fullPath: '/brand-icons/01-database-hug-full.png',
    dockPath: '/brand-icons/01-database-hug-dock.png',
  },
  {
    id: '02',
    slug: 'database-search',
    titleZh: '搜库小狗',
    titleEn: 'Database search',
    iconPath: '/brand-icons/02-database-search.png',
    icon2xPath: '/brand-icons/02-database-search@2x.png',
    fullPath: '/brand-icons/02-database-search-full.png',
    dockPath: '/brand-icons/02-database-search-dock.png',
  },
  {
    id: '03',
    slug: 'bandana-badge',
    titleZh: '头巾徽章',
    titleEn: 'Bandana badge',
    iconPath: '/brand-icons/03-bandana-badge.png',
    icon2xPath: '/brand-icons/03-bandana-badge@2x.png',
    fullPath: '/brand-icons/03-bandana-badge-full.png',
    dockPath: '/brand-icons/03-bandana-badge-dock.png',
  },
  {
    id: '04',
    slug: 'magnifier-wink',
    titleZh: '放大镜眨眼',
    titleEn: 'Magnifier wink',
    iconPath: '/brand-icons/04-magnifier-wink.png',
    icon2xPath: '/brand-icons/04-magnifier-wink@2x.png',
    fullPath: '/brand-icons/04-magnifier-wink-full.png',
    dockPath: '/brand-icons/04-magnifier-wink-dock.png',
  },
  {
    id: '05',
    slug: 'window-peek',
    titleZh: '窗口探头',
    titleEn: 'Window peek',
    iconPath: '/brand-icons/05-window-peek.png',
    icon2xPath: '/brand-icons/05-window-peek@2x.png',
    fullPath: '/brand-icons/05-window-peek-full.png',
    dockPath: '/brand-icons/05-window-peek-dock.png',
  },
  {
    id: '06',
    slug: 'hex-collar',
    titleZh: '六边项圈',
    titleEn: 'Hex collar',
    iconPath: '/brand-icons/06-hex-collar.png',
    icon2xPath: '/brand-icons/06-hex-collar@2x.png',
    fullPath: '/brand-icons/06-hex-collar-full.png',
    dockPath: '/brand-icons/06-hex-collar-dock.png',
  },
  {
    id: '07',
    slug: 'graph-sit',
    titleZh: '关系图',
    titleEn: 'Graph sit',
    iconPath: '/brand-icons/07-graph-sit.png',
    icon2xPath: '/brand-icons/07-graph-sit@2x.png',
    fullPath: '/brand-icons/07-graph-sit-full.png',
    dockPath: '/brand-icons/07-graph-sit-dock.png',
  },
  {
    id: '08',
    slug: 'cloud-banner',
    titleZh: '云朵横幅',
    titleEn: 'Cloud banner',
    iconPath: '/brand-icons/08-cloud-banner.png',
    icon2xPath: '/brand-icons/08-cloud-banner@2x.png',
    fullPath: '/brand-icons/08-cloud-banner-full.png',
    dockPath: '/brand-icons/08-cloud-banner-dock.png',
  },
  {
    id: '09',
    slug: 'terminal-sit',
    titleZh: '终端旁坐',
    titleEn: 'Terminal sit',
    iconPath: '/brand-icons/09-terminal-sit.png',
    icon2xPath: '/brand-icons/09-terminal-sit@2x.png',
    fullPath: '/brand-icons/09-terminal-sit-full.png',
    dockPath: '/brand-icons/09-terminal-sit-dock.png',
  },
  {
    id: '10',
    slug: 'compass-bandana',
    titleZh: '罗盘头巾',
    titleEn: 'Compass bandana',
    iconPath: '/brand-icons/10-compass-bandana.png',
    icon2xPath: '/brand-icons/10-compass-bandana@2x.png',
    fullPath: '/brand-icons/10-compass-bandana-full.png',
    dockPath: '/brand-icons/10-compass-bandana-dock.png',
  },
];

const BRAND_ICON_BY_ID = new Map(BRAND_ICONS.map((item) => [item.id, item]));

export function sanitizeBrandIconId(value: unknown): BrandIconId {
  const raw = String(value || '').trim();
  if (BRAND_ICON_BY_ID.has(raw as BrandIconId)) {
    return raw as BrandIconId;
  }
  return DEFAULT_BRAND_ICON_ID;
}

export function resolveBrandIcon(id?: unknown): BrandIconDefinition {
  return BRAND_ICON_BY_ID.get(sanitizeBrandIconId(id)) || BRAND_ICONS[1];
}

export function resolveBrandIconSrc(id?: unknown, prefer2x = true): string {
  const icon = resolveBrandIcon(id);
  return prefer2x ? icon.icon2xPath : icon.iconPath;
}

export function resolveBrandFullSrc(id?: unknown): string {
  return resolveBrandIcon(id).fullPath;
}

/** Opaque full-bleed tile for macOS Dock (system applies squircle). */
export function resolveBrandDockSrc(id?: unknown): string {
  return resolveBrandIcon(id).dockPath;
}
