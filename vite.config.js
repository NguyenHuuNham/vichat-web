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
  const chatbotProxy = {
    '/api': {
      target: 'http://127.0.0.1:8093',
      changeOrigin: true,
    },
  }
  const managementProxy = {
    '/management-api': {
      target: 'http://127.0.0.1:8093',
      changeOrigin: true,
      rewrite: path => path.replace(/^\/management-api/, ''),
    },
  }

  return {
    plugins: [react()],
    server: { proxy: { ...mediaProxy, ...chatbotProxy, ...managementProxy } },
    preview: { proxy: { ...mediaProxy, ...chatbotProxy, ...managementProxy } },
  }
})
