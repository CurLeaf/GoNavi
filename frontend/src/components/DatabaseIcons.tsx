import React from 'react';

// ─── 公共接口 ───────────────────────────────────────────────

export interface DbIconProps {
    size?: number;
    color?: string;
}

const IconFrame: React.FC<{
    size: number;
    children: React.ReactNode;
}> = ({ size, children }) => (
    <span
        data-db-icon-frame="true"
        style={{
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}
    >
        {children}
    </span>
);

// ─── 默认色表 ───────────────────────────────────────────────

const DB_DEFAULT_COLORS: Record<string, string> = {
    mysql:      '#00758F',
    mariadb:    '#003545',
    oceanbase:  '#0052CC',
    postgres:   '#336791',
    redis:      '#DC382D',
    mongodb:    '#47A248',
    elasticsearch: '#FEC514',
    jvm:        '#1677FF',
    kingbase:   '#1890FF',
    dameng:     '#E6002D',
    oracle:     '#F80000',
    sqlserver:  '#CC2927',
    clickhouse: '#FFBF00',
    sqlite:     '#003B57',
    duckdb:     '#FFC107',
    vastbase:   '#0066CC',
    opengauss:  '#2446A8',
    gaussdb:    '#0B7FAB',
    goldendb:   '#D97706',
    highgo:     '#00A86B',
    iris:       '#1F6FEB',
    tdengine:   '#2962FF',
    iotdb:      '#0F766E',
    rocketmq:   '#EA580C',
    mqtt:       '#0EA5A4',
    kafka:      '#F97316',
    rabbitmq:   '#FF6B35',
    chroma:     '#7C3AED',
    qdrant:     '#DC244C',
    diros:      '#0050B3',
    starrocks:  '#00A6A6',
    sphinx:     '#2F5D62',
    custom:     '#888888',
};

export const getDbDefaultColor = (type: string): string =>
    DB_DEFAULT_COLORS[type?.toLowerCase()] || DB_DEFAULT_COLORS.custom;

// ─── 有品牌 SVG 文件的数据库类型（文件在 /db-icons/ 下） ────

const BRAND_SVG_TYPES = new Set([
    'mysql', 'mariadb', 'postgres', 'redis', 'mongodb', 'clickhouse', 'sqlite',
    'diros', 'sphinx', 'duckdb', 'sqlserver', 'elasticsearch',
    'gaussdb', 'goldendb', 'iotdb', 'rocketmq', 'mqtt', 'kafka', 'rabbitmq',
    'chroma', 'qdrant',
]);

/** 品牌 SVG 图标：用 <img> 加载 /db-icons/*.svg */
const BrandSvgIcon: React.FC<{ type: string; size: number; color?: string }> = ({ type, size, color }) => {
    const bgColor = color || getDbDefaultColor(type);
    return (
        <IconFrame size={size}>
            <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: size, height: size, borderRadius: size * 0.22,
                background: '#fff', border: `1.5px solid ${bgColor}`,
                flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box',
            }}>
                <img
                    src={`/db-icons/${type}.svg`}
                    alt={type}
                    width={Math.round(size * 0.64)}
                    height={Math.round(size * 0.64)}
                    style={{ display: 'block', objectFit: 'contain' }}
                />
            </span>
        </IconFrame>
    );
};

// ─── 彩色标签图标（fallback） ──────────────────────────────

/** 通用彩色标签：填充背景 + 白色粗体缩写 */
const ColorBadge: React.FC<{ size: number; color: string; label: string }> = ({ size, color, label }) => {
    const textSize = label.length <= 2 ? size * 0.48 : size * 0.38;
    return (
        <IconFrame size={size}>
            <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="24" height="24" rx="5" fill={color}/>
                <text
                    x="12" y="12" dominantBaseline="central" textAnchor="middle"
                    fontSize={textSize} fontWeight="800"
                    style={{ fontFamily: 'var(--gn-font-sans, "Inter", "PingFang SC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif)' }}
                    fill="#fff" letterSpacing={label.length > 2 ? -0.5 : 0}
                >
                    {label}
                </text>
            </svg>
        </IconFrame>
    );
};

// ─── 各数据库图标 ───────────────────────────────────────────

// 有品牌 SVG 的数据库
const MySQLIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mysql" size={size} color={color} />
);
const MariaDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mariadb" size={size} color={color} />
);
const OceanBaseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.oceanbase} label="OB" />
);
const PostgresIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="postgres" size={size} color={color} />
);
const RedisIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="redis" size={size} color={color} />
);
const MongoDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mongodb" size={size} color={color} />
);
const ClickHouseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="clickhouse" size={size} color={color} />
);
const SQLiteIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sqlite" size={size} color={color} />
);

// 无品牌 SVG → 彩色文字标签
const OracleIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.oracle} label="Or" />
);
const SQLServerIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sqlserver" size={size} color={color} />
);
const DorisIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="diros" size={size} color={color} />
);
const StarRocksIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.starrocks} label="SR" />
);
const SphinxIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sphinx" size={size} color={color} />
);
const DuckDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="duckdb" size={size} color={color} />
);
const KingBaseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.kingbase} label="KB" />
);
const DamengIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.dameng} label="DM" />
);
const VastBaseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.vastbase} label="VB" />
);
const OpenGaussIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.opengauss} label="OG" />
);
const GaussDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="gaussdb" size={size} color={color} />
);
const GoldenDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="goldendb" size={size} color={color} />
);
const HighGoIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.highgo} label="HG" />
);
const IrisIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.iris} label="IR" />
);
const TDengineIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.tdengine} label="TD" />
);
const IoTDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="iotdb" size={size} color={color} />
);
const RocketMQIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="rocketmq" size={size} color={color} />
);
const MQTTIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mqtt" size={size} color={color} />
);
const KafkaIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="kafka" size={size} color={color} />
);
const RabbitMQIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="rabbitmq" size={size} color={color} />
);
const ChromaIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="chroma" size={size} color={color} />
);
const QdrantIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="qdrant" size={size} color={color} />
);
const JVMIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.jvm} label="JVM" />
);
const ElasticsearchIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="elasticsearch" size={size} color={color} />
);

/** Custom — 齿轮图标 */
const CustomIcon: React.FC<DbIconProps> = ({ size = 16, color }) => {
    const c = color || DB_DEFAULT_COLORS.custom;
    return (
        <IconFrame size={size}>
            <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="24" height="24" rx="5" fill={c}/>
                <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.5" fill="none"/>
                <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.34 6.34l1.77 1.77M15.89 15.89l1.77 1.77M6.34 17.66l1.77-1.77M15.89 8.11l1.77-1.77" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
        </IconFrame>
    );
};

// ─── 图标注册表 ─────────────────────────────────────────────

const DorisIconFallback: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.diros} label="Do" />
);
const SphinxIconFallback: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.sphinx} label="Sp" />
);

const DB_ICON_MAP: Record<string, React.FC<DbIconProps>> = {
    mysql: MySQLIcon,
    mariadb: MariaDBIcon,
    oceanbase: OceanBaseIcon,
    diros: DorisIcon,
    starrocks: StarRocksIcon,
    sphinx: SphinxIcon,
    postgres: PostgresIcon,
    redis: RedisIcon,
    mongodb: MongoDBIcon,
    jvm: JVMIcon,
    kingbase: KingBaseIcon,
    dameng: DamengIcon,
    oracle: OracleIcon,
    sqlserver: SQLServerIcon,
    clickhouse: ClickHouseIcon,
    sqlite: SQLiteIcon,
    duckdb: DuckDBIcon,
    vastbase: VastBaseIcon,
    opengauss: OpenGaussIcon,
    gaussdb: GaussDBIcon,
    goldendb: GoldenDBIcon,
    highgo: HighGoIcon,
    iris: IrisIcon,
    tdengine: TDengineIcon,
    iotdb: IoTDBIcon,
    rocketmq: RocketMQIcon,
    mqtt: MQTTIcon,
    kafka: KafkaIcon,
    rabbitmq: RabbitMQIcon,
    chroma: ChromaIcon,
    qdrant: QdrantIcon,
    elasticsearch: ElasticsearchIcon,
    custom: CustomIcon,
};

/** 可选图标类型列表（用于图标选择器 UI） */
export const DB_ICON_TYPES: string[] = [
    'mysql', 'mariadb', 'oceanbase', 'postgres', 'redis', 'mongodb', 'jvm',
    'oracle', 'sqlserver', 'sqlite', 'duckdb', 'clickhouse', 'starrocks',
    'kingbase', 'dameng', 'vastbase', 'opengauss', 'gaussdb', 'goldendb', 'highgo', 'iris', 'tdengine', 'iotdb', 'rocketmq', 'mqtt', 'kafka', 'rabbitmq', 'chroma', 'qdrant', 'elasticsearch', 'custom',
];

/** 该类型是否有品牌 SVG 文件 */
export const hasBrandSvg = (type: string): boolean => BRAND_SVG_TYPES.has(type?.toLowerCase());

/** 获取数据库图标 React 节点 */
export const getDbIcon = (type: string, color?: string, size?: number): React.ReactNode => {
    const key = (type || 'custom').toLowerCase();
    const Component = DB_ICON_MAP[key] || CustomIcon;
    return <Component size={size} color={color} />;
};

/** 获取数据库图标显示名称（中文） */
export const getDbIconLabel = (type: string): string => {
    const labels: Record<string, string> = {
        mysql: 'MySQL', mariadb: 'MariaDB', oceanbase: 'OceanBase', postgres: 'PostgreSQL',
        redis: 'Redis', mongodb: 'MongoDB', jvm: 'JVM',
        oracle: 'Oracle',
        sqlserver: 'SQL Server', clickhouse: 'ClickHouse', sqlite: 'SQLite',
        starrocks: 'StarRocks',
        duckdb: 'DuckDB', kingbase: '金仓', dameng: '达梦',
        vastbase: 'VastBase', opengauss: 'OpenGauss', gaussdb: 'GaussDB', goldendb: 'GoldenDB', highgo: '瀚高', iris: 'InterSystems IRIS', tdengine: 'TDengine', iotdb: 'Apache IoTDB', rocketmq: 'RocketMQ', mqtt: 'MQTT', kafka: 'Kafka', rabbitmq: 'RabbitMQ',
        chroma: 'Chroma',
        qdrant: 'Qdrant',
        elasticsearch: 'Elasticsearch',
        custom: '自定义',
    };
    return labels[type?.toLowerCase()] || type;
};

/** 预设颜色列表 */
export const PRESET_ICON_COLORS: string[] = [
    '#336791', '#00758F', '#DC382D', '#47A248', '#F80000',
    '#CC2927', '#1890FF', '#E6002D', '#FFBF00', '#2962FF',
    '#00A86B', '#0066CC', '#FF6B35', '#7C3AED',
];
