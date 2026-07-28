# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Tinode chat integration

The realtime chat engine uses the official `tinode-sdk` package. Chatapi/Tinode
owns topic subscriptions, message history, publishing, attachments, reactions,
typing, and read state. Chatmgt owns only management metadata and issues the
short-lived Tinode token used by the UI.

`chatManagementService` is the company-owned boundary for authentication,
tenant-scoped users, and conversation metadata. Configure
`VITE_CHAT_MANAGEMENT_API_URL` for the production service. Its login response may
include `tinode`, `tinode_auth`, or `tinode_token`; conversation records should
include `tinode_topic`. The management service is required for account and
conversation metadata; the browser never receives a bundled account file.

Do not put Tinode root credentials or account-service secrets in frontend
environment variables.

## Internal accounts

Accounts, password hashes, tenant membership and audit events are stored in the
chatmgt PostgreSQL database. Administrators create and disable accounts; public
self-registration and browser-shipped credentials are disabled.

## Chatbot

The demo app includes a separate **Trợ lý Sông Hồng** conversation. Its history is isolated per logged-in account and stored locally for testing.

The chatbot backend is intentionally not routed through chatmgt. If it is enabled
later, it must be deployed as a separate service and configured explicitly:

```env
VITE_CHATBOT_API_URL=https://your-chatservice.example/api/v1/chatbot/message
```

The endpoint receives `message`, `conversation_id`, `user_id` and returns `{ "reply": "..." }`. When the endpoint is unavailable, the UI falls back to a limited local response instead of affecting normal chats.
