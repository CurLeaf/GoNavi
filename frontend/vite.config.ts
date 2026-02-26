import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/')

const sanitizeChunkToken = (raw: string): string =>
  String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'misc'

const firstSegmentAfter = (id: string, marker: string): string => {
  const idx = id.indexOf(marker)
  if (idx < 0) return ''
  const rest = id.substring(idx + marker.length)
  const [segment] = rest.split('/')
  return sanitizeChunkToken(segment)
}

const resolveMonacoChunk = (id: string, prefix: string): string | undefined => {
  if (!id.includes('/node_modules/monaco-editor/')) return undefined

  if (id.includes('/esm/vs/language/typescript/')) {
    if (id.includes('typescriptServices')) return `${prefix}-ts-services`
    return `${prefix}-typescript`
  }
  if (id.includes('/esm/vs/language/json/')) return `${prefix}-json`
  if (id.includes('/esm/vs/language/css/')) return `${prefix}-css`
  if (id.includes('/esm/vs/language/html/')) return `${prefix}-html`

  if (id.includes('/esm/vs/editor/contrib/')) {
    return `${prefix}-editor-contrib-${firstSegmentAfter(id, '/esm/vs/editor/contrib/')}`
  }
  if (id.includes('/esm/vs/editor/browser/')) {
    return `${prefix}-editor-browser-${firstSegmentAfter(id, '/esm/vs/editor/browser/')}`
  }
  if (id.includes('/esm/vs/editor/common/')) {
    return `${prefix}-editor-common-${firstSegmentAfter(id, '/esm/vs/editor/common/')}`
  }
  if (id.includes('/esm/vs/editor/')) return `${prefix}-editor`

  if (id.includes('/esm/vs/base/browser/')) return `${prefix}-base-browser`
  if (id.includes('/esm/vs/base/common/')) return `${prefix}-base-common`
  if (id.includes('/esm/vs/base/')) return `${prefix}-base`

  if (id.includes('/esm/vs/platform/')) return `${prefix}-platform`

  return `${prefix}-misc`
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist', // Standard Wails output directory
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = normalizeModuleId(id)
          if (!moduleId.includes('node_modules')) return undefined

          const monacoChunk = resolveMonacoChunk(moduleId, 'vendor-monaco')
          if (monacoChunk) {
            return monacoChunk
          }
          if (moduleId.includes('/node_modules/@monaco-editor/react/')) return 'vendor-monaco-react'

          if (moduleId.includes('/node_modules/antd/es/')) {
            return `vendor-antd-${firstSegmentAfter(moduleId, '/node_modules/antd/es/')}`
          }
          if (moduleId.includes('/node_modules/antd/')) return 'vendor-antd'
          if (moduleId.includes('/node_modules/@ant-design/icons/')) return 'vendor-antd-icons'
          if (moduleId.includes('/node_modules/@ant-design/cssinjs/')) return 'vendor-antd-css'
          if (moduleId.includes('/node_modules/rc-')) return 'vendor-antd-rc'

          if (moduleId.includes('/node_modules/@dnd-kit/')) return 'vendor-dnd-kit'
          if (moduleId.includes('/node_modules/sql-formatter/')) return 'vendor-sql-formatter'

          if (
            moduleId.includes('/node_modules/react/')
            || moduleId.includes('/node_modules/react-dom/')
            || moduleId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (
            moduleId.includes('/node_modules/zustand/')
            || moduleId.includes('/node_modules/uuid/')
            || moduleId.includes('/node_modules/clsx/')
            || moduleId.includes('/node_modules/react-resizable/')
          ) {
            return 'vendor-utils'
          }

          return 'vendor-misc'
        },
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = normalizeModuleId(id)
          if (!moduleId.includes('node_modules')) return undefined
          return resolveMonacoChunk(moduleId, 'worker-monaco')
        },
      },
    },
  },
})
