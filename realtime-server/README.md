# Chat V2 Realtime Server

Socket.IO scaffold for the next-generation chat transport.

## Architecture

- `Socket.IO` handles realtime delivery, typing, presence, delivery/read acks, and call signaling.
- Firestore remains the durable persistence layer for chats, messages, membership, and sync recovery.
- Firebase Storage remains the media store for files, images, voice notes, and videos.
- Encryption stays client-side; the server forwards encrypted payloads and never needs plaintext.

## What is included

- Firebase ID token auth placeholder
- Socket room model for users, chats, and calls
- Typed client/server event contracts
- Firestore persistence adapter scaffold
- Presence and typing lifecycle scaffold
- Upload session scaffold
- Call signaling scaffold for 1:1 and group-ready events

## Environment

Copy `.env.example` to `.env` and fill:

- `PORT`
- `CORS_ORIGIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIREBASE_STORAGE_BUCKET`

## Install and run

```bash
cd realtime-server
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

## Event contract summary

Client to server:

- `auth:connect`
- `chat:subscribe`
- `chat:unsubscribe`
- `message:send`
- `message:retry`
- `message:read`
- `message:delivered`
- `typing:start`
- `typing:stop`
- `presence:heartbeat`
- `upload:init`
- `upload:complete`
- `call:ring`
- `call:accept`
- `call:decline`
- `call:offer`
- `call:answer`
- `call:ice`
- `call:end`

Server to client:

- `chat:snapshot`
- `chat:delta`
- `message:accepted`
- `message:new`
- `message:update`
- `receipt:update`
- `typing:update`
- `presence:update`
- `upload:url`
- `call:event`
- `error:event`

## Notes

- This service is intentionally a scaffold. It is safe to wire it behind a feature flag and keep the current Firestore chat live until the new realtime flow is validated.
- The code is organized so the transport layer can evolve independently from persistence.
- The shared protocol types live in `src/lib/chat-v2/protocol.ts`.

