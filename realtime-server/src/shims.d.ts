declare module 'dotenv' {
  export function config(): void;
}

declare module 'firebase-admin/auth' {
  export interface DecodedIdToken {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  }

  export interface Auth {
    verifyIdToken(token: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
  }
}

declare module 'firebase-admin/firestore' {
  export class Timestamp {
    static now(): Timestamp;
    toMillis(): number;
  }

  export class FieldValue {
    static serverTimestamp(): unknown;
  }

  export interface DocumentData {
    [key: string]: unknown;
  }

  export interface QueryDocumentSnapshot<T = DocumentData> {
    id: string;
    ref: DocumentReference<T>;
    data(): T;
  }

  export interface QuerySnapshot<T = DocumentData> {
    docs: Array<QueryDocumentSnapshot<T>>;
    empty: boolean;
  }

  export interface DocumentReference<T = DocumentData> {
    id: string;
    get(): Promise<{ exists: boolean; id: string; data(): T | undefined }>;
    set(data: Partial<T> | Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
    update(data: Record<string, unknown>): Promise<void>;
    collection(name: string): CollectionReference<T>;
  }

  export interface CollectionReference<T = DocumentData> {
    doc(id?: string): DocumentReference<T>;
    get(): Promise<QuerySnapshot<T>>;
    set(data: Partial<T> | Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
    add(data: Partial<T> | Record<string, unknown>): Promise<DocumentReference<T>>;
    where(fieldPath: string, opStr: FirebaseFirestore.WhereFilterOp, value: unknown): Query<T>;
    orderBy(fieldPath: string, directionStr?: FirebaseFirestore.OrderByDirection): Query<T>;
    limit(limit: number): Query<T>;
  }

  export interface Query<T = DocumentData> {
    get(): Promise<QuerySnapshot<T>>;
    where(fieldPath: string, opStr: FirebaseFirestore.WhereFilterOp, value: unknown): Query<T>;
    orderBy(fieldPath: string, directionStr?: FirebaseFirestore.OrderByDirection): Query<T>;
    limit(limit: number): Query<T>;
  }

  export interface WriteBatch {
    set<T = DocumentData>(ref: DocumentReference<T>, data: Partial<T> | Record<string, unknown>, options?: { merge?: boolean }): WriteBatch;
    commit(): Promise<void>;
  }

  export interface Firestore {
    collection(name: string): CollectionReference;
    batch(): WriteBatch;
  }

  export namespace FirebaseFirestore {
    export type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in';
    export type OrderByDirection = 'asc' | 'desc';
  }
}

declare module 'firebase-admin' {
  import type { DecodedIdToken } from 'firebase-admin/auth';
  import type { Firestore } from 'firebase-admin/firestore';

  export interface ServiceAccount {
    project_id?: string;
    client_email?: string;
    private_key?: string;
    [key: string]: unknown;
  }

  export interface App {
    auth(): { verifyIdToken(token: string, checkRevoked?: boolean): Promise<DecodedIdToken> };
    firestore(): Firestore;
  }

  export const credential: {
    cert(serviceAccount: ServiceAccount): unknown;
  };

  export function initializeApp(options?: {
    credential?: unknown;
    projectId?: string;
    storageBucket?: string;
  }): App;

  export const firestore: {
    FieldValue: typeof import('firebase-admin/firestore').FieldValue;
    Timestamp: typeof import('firebase-admin/firestore').Timestamp;
  };

  const admin: {
    credential: typeof credential;
    initializeApp: typeof initializeApp;
    firestore: typeof firestore;
  };
  export default admin;
}

declare module 'socket.io' {
  export interface DefaultEventsMap {
    [event: string]: (...args: any[]) => void;
  }

  export interface SocketData {
    [key: string]: unknown;
  }

  export interface Socket<ReceiveEvents = DefaultEventsMap, SendEvents = DefaultEventsMap, InterServerEvents = DefaultEventsMap, SocketDataType = SocketData> {
    id: string;
    handshake: {
      auth?: Record<string, unknown>;
      headers: Record<string, unknown>;
    };
    data: SocketDataType;
    emit(event: string, ...args: any[]): void;
    on(event: string, listener: (...args: any[]) => void): void;
    join(room: string): void;
    leave(room: string): void;
    disconnect(close?: boolean): void;
  }

  export interface Namespace<ReceiveEvents = DefaultEventsMap, SendEvents = DefaultEventsMap, InterServerEvents = DefaultEventsMap, SocketDataType = SocketData> {
    emit(event: string, ...args: any[]): void;
    to(room: string): Namespace<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>;
    sockets: { sockets: Map<string, Socket<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>> };
  }

  export interface ServerOptions {
    cors?: {
      origin?: string | string[];
      credentials?: boolean;
    };
    path?: string;
  }

  export class Server<ReceiveEvents = DefaultEventsMap, SendEvents = DefaultEventsMap, InterServerEvents = DefaultEventsMap, SocketDataType = SocketData> {
    constructor(server: unknown, options?: ServerOptions);
    use(middleware: (socket: Socket<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>, next: (err?: Error) => void) => void): void;
    on(event: 'connection', listener: (socket: Socket<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>) => void): void;
    to(room: string): Namespace<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>;
    emit(event: string, ...args: any[]): void;
    sockets: { sockets: Map<string, Socket<ReceiveEvents, SendEvents, InterServerEvents, SocketDataType>> };
  }
}
