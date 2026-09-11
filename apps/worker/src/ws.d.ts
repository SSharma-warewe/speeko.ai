declare module 'ws' {
  import { EventEmitter } from 'node:events';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    readonly readyState: number;
    constructor(
      address: string,
      options?: { headers?: Record<string, string> },
    );
    send(data: Buffer | string): void;
    close(): void;
    removeAllListeners(): this;
  }
}
