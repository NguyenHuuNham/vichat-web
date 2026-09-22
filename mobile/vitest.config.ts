import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(new URL('./src/test/reactNativeMock.ts', import.meta.url)),
      'expo-device': fileURLToPath(new URL('./src/test/expoDeviceMock.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
