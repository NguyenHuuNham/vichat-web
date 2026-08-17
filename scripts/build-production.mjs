import { build } from 'vite';

const productionDefaults = {
  VITE_TINODE_HOST: 'chat.upgo.vn',
  VITE_TINODE_API_KEY: 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K',
  VITE_TINODE_SECURE: 'true',
  VITE_TINODE_TRANSPORT: 'ws',
  VITE_TINODE_PERSIST: 'false',
  VITE_TINODE_APP_NAME: 'SONGHONG/1.0',
  VITE_CHAT_MANAGEMENT_API_URL: 'https://chatmgt.upgo.vn',
  VITE_CHAT_MANAGEMENT_REMOTE_AUTH: 'true',
  // Account login resolves the active tenant from the verified UpGo session.
  // Keep this empty so a local env file cannot reintroduce a fixed tenant.
  VITE_CHAT_TENANT_ID: '',
  VITE_CHAT_AUTH_MODE: 'account_password',
  VITE_CALLS_ENABLED: 'true',
  VITE_CHAT_MODE: 'internal',
  VITE_CHATBOT_API_URL: 'https://chatmgt.upgo.vn/api/v1/chatbot/message',
  VITE_CHATBOT_WITH_CREDENTIALS: 'true',
  VITE_CHATBOT_ID: 'vichat-ai',
  VITE_CHATBOT_USERNAME: 'vichat_ai',
  VITE_CHATBOT_DISPLAY_NAME: 'ViChat AI',
  VITE_CHATBOT_DISPLAY_TITLE: 'Trợ lý tri thức doanh nghiệp',
  VITE_CHATBOT_DISPLAY_ORGANIZATION: 'GON Platform',
  VITE_CHATBOT_DISPLAY_AVATAR: '/vichat-ai.svg',
};

for (const [name, value] of Object.entries(productionDefaults)) {
  if (!process.env[name]) process.env[name] = value;
}

await build({ mode: 'production' });
