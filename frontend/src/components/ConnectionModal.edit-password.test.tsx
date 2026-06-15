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

  it('reuses the shared backend-cancel helper for file and certificate pickers', () => {
    expect(source).not.toContain('res?.message !== "已取消"');
    expect(source.match(/isBackendCancelledResult\(res\)/g) ?? []).toHaveLength(3);
  });

  it('uses localized SSL mode labels instead of hardcoded English strings', () => {
    expect(source).not.toContain('label: "Preferred"');
    expect(source).not.toContain('label: "Required"');
    expect(source).not.toContain('label: "Skip Verify"');
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.preferred",\s*\)/,
    );
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.required",\s*\)/,
    );
    expect(source).toMatch(
      /label:\s*t\(\s*"connection\.modal\.network\.ssl_mode\.skip_verify",\s*\)/,
    );
  });
});
