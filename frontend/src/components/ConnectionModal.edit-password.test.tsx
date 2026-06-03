import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ConnectionModal.tsx', import.meta.url), 'utf8');

describe('ConnectionModal edit password behavior', () => {
  it('keeps the prefilled primary password masked by default', () => {
    expect(source).toContain('const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);');
    expect(source).not.toContain('setPrimaryPasswordVisible(String(config.password || "").trim() !== "")');
    expect(source).toContain('visible: primaryPasswordVisible,');
  });

  it('does not render the primary-password clear helper block anymore', () => {
    expect(source).not.toContain('description:\n                          "当前已保存主连接密码。留空表示继续沿用，输入新值表示替换。"');
    expect(source).not.toContain('description:\n                          "当前已保存 Redis 密码。留空表示继续沿用，输入新值表示替换。"');
    expect(source).toContain('String(config.password || "") === ""');
  });
});

describe('ConnectionModal data source registry', () => {
  it('exposes Elasticsearch in the create-connection picker with HTTP defaults', () => {
    expect(source).toContain('case "elasticsearch":');
    expect(source).toContain('return 9200;');
    expect(source).toContain('elasticsearch: ["http", "https"]');
    expect(source).toContain('key: "elasticsearch"');
    expect(source).toContain('name: "Elasticsearch"');
    expect(source).toContain('getDbIcon("elasticsearch", undefined, 36)');
    expect(source).toContain('type === "elasticsearch"');
    expect(source).toContain('return "支持索引浏览、Mapping 检查、JSON DSL 和 query_string 查询";');
    expect(source).toContain(
      'type === "clickhouse" ? "default" : (type === "redis" || type === "elasticsearch") ? "" : "root";',
    );
    expect(source).toContain(
      'placeholder={dbType === "elasticsearch" ? "未开启认证可留空" : undefined}',
    );
    expect(source).toContain('label="显示数据库 (留空显示全部)"');
  });
});
