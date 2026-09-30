/* global __dirname, module, process, require, Buffer, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const base = require('./app.json');

function writeGeneratedCredential(fileName, rawValue, validate) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  if (fs.existsSync(raw)) return path.resolve(raw);

  const candidates = [raw];
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    if (decoded) candidates.push(decoded);
  } catch {
    // The value may be inline JSON rather than base64.
  }

  let parsed;
  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue;
    try {
      const value = JSON.parse(candidate);
      if (validate(value)) {
        parsed = value;
        break;
      }
    } catch {
      // Keep checking the other supported representations.
    }
  }
  if (!parsed) throw new Error(`${fileName} must be an existing file, valid JSON, or base64-encoded JSON.`);

  const generatedPath = path.resolve(__dirname, '.expo', fileName);
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return generatedPath;
}

const configuredGoogleServices = process.env.GOOGLE_SERVICES_JSON || process.env.EXPO_GOOGLE_SERVICES_JSON || '';
const configuredGoogleServicesBase64 = process.env.GOOGLE_SERVICES_JSON_BASE64 || process.env.EXPO_GOOGLE_SERVICES_JSON_BASE64 || '';
const localGoogleServices = path.resolve(__dirname, 'google-services.json');
const googleServicesFile = configuredGoogleServices || configuredGoogleServicesBase64
  ? writeGeneratedCredential(
    'google-services.json',
    configuredGoogleServices || configuredGoogleServicesBase64,
    value => Boolean(value?.project_info?.project_id && Array.isArray(value?.client)),
  )
  : fs.existsSync(localGoogleServices) ? localGoogleServices : '';

if (process.env.EXPO_PUBLIC_PUSH_ENABLED !== 'false' && !googleServicesFile) {
  console.warn('[ViChat] Android remote push is disabled in this build: GOOGLE_SERVICES_JSON(_BASE64) is missing.');
}

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [...(base.expo.plugins || []), 'expo-audio'],
    android: {
      ...base.expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  },
};
