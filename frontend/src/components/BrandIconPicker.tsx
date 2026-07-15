import React from 'react';
import { BRAND_ICONS, type BrandIconId } from '../brand/brandIcons';

type BrandIconPickerProps = {
  value: string;
  onChange: (id: BrandIconId) => void;
  darkMode?: boolean;
};

export default function BrandIconPicker({ value, onChange, darkMode = false }: BrandIconPickerProps) {
  const border = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(16,24,40,0.12)';
  const activeBorder = '#1677ff';
  const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : '#fff';
  const muted = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(16,24,40,0.55)';
  const title = darkMode ? 'rgba(255,255,255,0.88)' : 'rgba(16,24,40,0.88)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 14,
      }}
    >
      {BRAND_ICONS.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              border: `2px solid ${active ? activeBorder : border}`,
              background: cardBg,
              borderRadius: 14,
              padding: '12px 10px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              boxShadow: active
                ? (darkMode ? '0 0 0 3px rgba(22,119,255,0.25)' : '0 0 0 3px rgba(22,119,255,0.15)')
                : 'none',
              transition: 'border-color 120ms ease, box-shadow 120ms ease',
              overflow: 'visible',
            }}
          >
            {/* Use full lockup so the complete logo is visible in the picker */}
            <div
              style={{
                width: '100%',
                height: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <img
                src={item.fullPath}
                alt={item.titleZh}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
                draggable={false}
              />
            </div>
            <div style={{ textAlign: 'center', minWidth: 0, width: '100%' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: title }}>
                #{item.id} {item.titleZh}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: muted,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={item.titleEn}
              >
                {item.titleEn}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
