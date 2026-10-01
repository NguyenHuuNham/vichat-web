import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function silenceTinodeSdkLogger() {
  const tinodeModule = '/node_modules/tinode-sdk/umd/tinode.prod.js'
  const loggerCall = 'console.log("["+i+"]",e,t.join(" "))'

  return {
    name: 'silence-tinode-sdk-production-logger',
    enforce: 'post',
    transform(code, id) {
      const normalizedId = id.replaceAll('\\', '/')
      if (!normalizedId.includes(tinodeModule) || !code.includes(loggerCall)) {
        return null
      }
      return {
        code: code.replace(loggerCall, 'void 0'),
        map: null,
      }
    },
  }
}

function manualFeatureChunk(id) {
  const normalizedId = id.replaceAll('\\', '/');
  const featureChunks = [
    ['/src/features/chatbot/', 'chatbot'],
    ['/src/features/chat/services/', 'chat-services'],
    ['/src/features/contacts/services/', 'contacts-services'],
    ['/src/features/demo/', 'demo-data'],
    ['/src/features/security/', 'security'],
    ['/src/features/i18n/', 'i18n'],
    ['/src/features/maintenance/', 'maintenance'],
  ];

  return featureChunks.find(([pathPrefix]) => normalizedId.includes(pathPrefix))?.[1];
}

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
    plugins: [react(), ...(mode === 'production' ? [silenceTinodeSdkLogger()] : [])],
    // Expose only the browser configuration allowlist; an unrelated VITE_*
    // secret in a developer or CI environment must never enter the bundle.
    envPrefix: [
      'VITE_CHAT_',
      'VITE_CHATBOT_',
      'VITE_TINODE_HOST',
      'VITE_TINODE_PUBLIC_APP_ID',
      'VITE_TINODE_SECURE',
      'VITE_TINODE_TRANSPORT',
      'VITE_TINODE_PERSIST',
      'VITE_TINODE_APP_NAME',
      'VITE_ACCOUNT_URL',
      'VITE_CALLS_ENABLED',
    ],
    build: {
      // Production artifacts must not publish source maps or source paths.
      sourcemap: false,
      rollupOptions: {
        output: {
          // Keep the initial App module below the browser warning threshold while
          // preserving the existing route- and interaction-level lazy chunks.
          manualChunks: manualFeatureChunk,
        },
      },
    },
    server: { proxy: { ...mediaProxy, ...managementProxy } },
    preview: { proxy: { ...mediaProxy, ...managementProxy } },
  }
})
