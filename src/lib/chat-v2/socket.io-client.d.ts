declare module 'socket.io-client' {
  export type SocketOptions = Record<string, unknown>;

  export interface Socket<ServerToClientEvents = Record<string, never>, ClientToServerEvents = Record<string, never>> {
    connected: boolean;
    id: string | null;
    auth?: unknown;
    connect(): Socket<ServerToClientEvents, ClientToServerEvents>;
    disconnect(): Socket<ServerToClientEvents, ClientToServerEvents>;
    emit(event: string, ...args: unknown[]): Socket<ServerToClientEvents, ClientToServerEvents>;
    on(event: string, listener: (...args: unknown[]) => void): Socket<ServerToClientEvents, ClientToServerEvents>;
    off(event: string, listener?: (...args: unknown[]) => void): Socket<ServerToClientEvents, ClientToServerEvents>;
    io: {
      on(event: string, listener: (...args: unknown[]) => void): void;
      off(event: string, listener?: (...args: unknown[]) => void): void;
    };
  }

  export function io<ServerToClientEvents = Record<string, never>, ClientToServerEvents = Record<string, never>>(
    url: string,
    options?: SocketOptions
  ): Socket<ServerToClientEvents, ClientToServerEvents>;
}
