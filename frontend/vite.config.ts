import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle startup locale modules before Wails starts proxying the WebView.
    include: [
      'antd/locale/de_DE',
      'antd/locale/en_US',
      'antd/locale/ja_JP',
      'antd/locale/ru_RU',
      'antd/locale/zh_CN',
      'antd/locale/zh_TW',
      'dayjs/locale/de',
      'dayjs/locale/ja',
      'dayjs/locale/ru',
      'dayjs/locale/zh-cn',
      'dayjs/locale/zh-tw',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist', // Standard Wails output directory
    emptyOutDir: true,
  }
})
