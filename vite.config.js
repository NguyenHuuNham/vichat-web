import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tinodeHost = env.VITE_TINODE_HOST || '127.0.0.1:6060'
  const tinodeProtocol = env.VITE_TINODE_SECURE === 'true' ? 'https' : 'http'
  const tinodeTarget = `${tinodeProtocol}://${tinodeHost}`
  const mediaProxy = {
    '/tinode-media': {
      target: tinodeTarget,
      changeOrigin: true,
      rewrite: path => path.replace(/^\/tinode-media/, ''),
    },
  }
  const managementProxy = {
    '/chatmgt-api': {
      target: 'http://127.0.0.1:8093',
      changeOrigin: true,
      rewrite: path => path.replace(/^\/chatmgt-api/, ''),
    },
  }

  return {
    plugins: [react()],
    server: { proxy: { ...mediaProxy, ...managementProxy } },
    preview: { proxy: { ...mediaProxy, ...managementProxy } },
  }
})
