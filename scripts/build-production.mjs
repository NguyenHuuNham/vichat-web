import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

const productionDefaults = {
  VITE_TINODE_HOST: 'chat.gonplatform.com',
  // This is a vendor public app identifier, never a server credential.
  // Production supplies the scoped value through the Docker build argument.
  VITE_TINODE_PUBLIC_APP_ID: process.env.VITE_TINODE_PUBLIC_APP_ID || 'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K',
  VITE_TINODE_SECURE: 'true',
  VITE_TINODE_TRANSPORT: 'ws',
  VITE_TINODE_PERSIST: 'false',
  VITE_TINODE_APP_NAME: 'SONGHONG/1.0',
  VITE_CHAT_MANAGEMENT_API_URL: 'https://chatmgt.gonplatform.com',
  VITE_CHAT_MANAGEMENT_REMOTE_AUTH: 'true',
  // Account login resolves the active tenant from the verified UpGo session.
  // Keep this empty so a local env file cannot reintroduce a fixed tenant.
  VITE_CHAT_TENANT_ID: '',
  VITE_CHAT_AUTH_MODE: 'account_password',
  VITE_CHAT_MEDIA_STORAGE: 's3',
  VITE_CHAT_MEDIA_FALLBACK_TO_TINODE: 'false',
  VITE_CALLS_ENABLED: 'true',
  VITE_CHAT_MODE: 'internal',
  VITE_CHATBOT_API_URL: 'https://chatmgt.gonplatform.com/api/v1/chatbot/message',
  VITE_CHATBOT_WITH_CREDENTIALS: 'true',
  VITE_CHATBOT_ID: 'vichat-ai',
  VITE_CHATBOT_USERNAME: 'vichat_ai',
  VITE_CHATBOT_DISPLAY_NAME: 'ViChat AI',
  VITE_CHATBOT_DISPLAY_TITLE: 'Trợ lý tri thức doanh nghiệp',
  VITE_CHATBOT_DISPLAY_ORGANIZATION: 'GON Platform',
  VITE_CHATBOT_DISPLAY_AVATAR: '/vichat-ai.svg',
};

// Do not let a legacy local/CI variable enter Vite's import.meta.env object.
delete process.env.VITE_TINODE_API_KEY;

for (const [name, value] of Object.entries(productionDefaults)) {
  if (!process.env[name]) process.env[name] = value;
}

await build({ mode: 'production' });

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

const distDirectory = path.resolve('dist');
const artifactFiles = await listFiles(distDirectory);
const forbiddenPatterns = [
  /VITE_TINODE_API_KEY/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:xox[baprs]-)[A-Za-z0-9-]{16,}\b/,
  /(?:APP_SECRET_KEY|CHAT_AUTH_JWT_SECRET|CHATBOT_API_KEY|MINIO_SECRET_KEY|TINODE_SSO_SECRET)=/,
];
const debugPattern = /console\.(?:log|info|debug)\s*\(/;
const violations = [];

for (const filePath of artifactFiles) {
  if (filePath.endsWith('.map')) {
    violations.push(`${path.relative(process.cwd(), filePath)}: source map is not allowed`);
    continue;
  }
  const content = await readFile(filePath, 'utf8');
  if (debugPattern.test(content)) {
    violations.push(`${path.relative(process.cwd(), filePath)}: debug console output is not allowed`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      violations.push(`${path.relative(process.cwd(), filePath)}: forbidden secret pattern ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Production artifact security check failed:\n${violations.join('\n')}`);
}
