import { build } from 'vite';

const productionDefaults = {
  VITE_TINODE_HOST: 'chat.upgo.vn',
  VITE_TINODE_API_KEY: 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K',
  VITE_TINODE_SECURE: 'true',
  VITE_TINODE_TRANSPORT: 'ws',
  VITE_TINODE_PERSIST: 'true',
  VITE_TINODE_APP_NAME: 'SONGHONG/1.0',
  VITE_CHAT_MANAGEMENT_API_URL: 'https://chatmgt.upgo.vn',
  VITE_CHAT_MANAGEMENT_REMOTE_AUTH: 'true',
  VITE_CHAT_TENANT_ID: 'song-hong',
  VITE_CHAT_AUTH_MODE: 'password',
  VITE_CALLS_ENABLED: 'false',
  VITE_CHATBOT_API_URL: 'https://chatmgt.upgo.vn/api/v1/chatbot/message',
  VITE_CHATBOT_WITH_CREDENTIALS: 'true',
};

for (const [name, value] of Object.entries(productionDefaults)) {
  if (!process.env[name]) process.env[name] = value;
}

await build({ mode: 'production' });
