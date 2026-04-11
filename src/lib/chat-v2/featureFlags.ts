export type ChatV2FeatureFlagName =
  | 'NEXT_PUBLIC_CHAT_V2_ENABLED'
  | 'NEXT_PUBLIC_CHAT_SOCKET_ENABLED'
  | 'NEXT_PUBLIC_CHAT_V2_UI';

function parseFlag(value: string | undefined | null): boolean {
  if (!value) return false;
  return ['1', 'true', 'on', 'yes'].includes(value.trim().toLowerCase());
}

function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function isChatV2Enabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_CHAT_V2_ENABLED) || isChatSocketEnabled();
}

export function isChatSocketEnabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_CHAT_SOCKET_ENABLED) && Boolean(getChatV2SocketUrl());
}

export function getChatV2SocketUrl(): string | null {
  return readEnv('NEXT_PUBLIC_CHAT_V2_SOCKET_URL', 'NEXT_PUBLIC_CHAT_SOCKET_URL');
}

export function getChatV2ModeLabel(): 'legacy' | 'hybrid' {
  return isChatV2Enabled() ? 'hybrid' : 'legacy';
}

export function getChatV2TransportMode(): 'firestore' | 'hybrid' {
  return isChatV2Enabled() ? 'hybrid' : 'firestore';
}

export interface ChatV2FeatureFlags {
  enabled: boolean;
  socketEnabled: boolean;
  uiEnabled: boolean;
  socketUrl: string | null;
}

export function getChatV2FeatureFlags(): ChatV2FeatureFlags {
  return {
    enabled: isChatV2Enabled(),
    socketEnabled: isChatSocketEnabled(),
    uiEnabled: parseFlag(process.env.NEXT_PUBLIC_CHAT_V2_UI),
    socketUrl: getChatV2SocketUrl(),
  };
}
