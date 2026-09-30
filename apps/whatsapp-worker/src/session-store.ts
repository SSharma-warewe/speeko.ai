import {
  BaseSessionService,
  createSession,
  type AppendEventRequest,
  type CreateSessionRequest,
  type GetSessionRequest,
  type ListSessionsResponse,
  type Session,
} from '@google/adk';
import type {
  WhatsAppSessionSnapshot,
  WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { HarnessApiClient } from './api-client.js';

/** Each turn gets an isolated ADK session; its snapshots are durable in the API. */
export class ApiSessionStore extends BaseSessionService {
  private session?: Session;
  constructor(
    private readonly turn: WhatsAppWorkerTurn,
    private readonly api: HarnessApiClient,
    private readonly signal?: AbortSignal,
  ) {
    super();
  }

  async createSession(request: CreateSessionRequest): Promise<Session> {
    this.session = createSession({
      id:
        request.sessionId ??
        this.turn.task?.sessionId ??
        this.turn.conversationId,
      appName: request.appName,
      userId: request.userId,
      state: structuredClone(this.turn.session.state),
      events: structuredClone(
        this.turn.session.events,
      ) as unknown as Session['events'],
      lastUpdateTime: Date.now() / 1000,
    });
    return this.session;
  }
  async getSession(_request: GetSessionRequest): Promise<Session | undefined> {
    return this.session;
  }
  async listSessions(): Promise<ListSessionsResponse> {
    return {
      sessions: this.session ? [this.session] : [],
      page: 1,
      limit: 1,
      totalItems: this.session ? 1 : 0,
      totalPages: this.session ? 1 : 0,
    };
  }
  async deleteSession(): Promise<void> {
    this.session = undefined;
  }

  async appendEvent(request: AppendEventRequest) {
    // Defence in depth: never persist reasoning text in durable sessions.
    if (request.event.content?.parts) {
      request.event.content.parts = request.event.content.parts.filter(
        (part) => part.thought !== true,
      );
    }
    const event = await super.appendEvent(request);
    if (!event.partial)
      await this.api.post(
        this.turn,
        'checkpoint',
        { session: this.snapshot() },
        this.signal,
      );
    return event;
  }
  snapshot(): WhatsAppSessionSnapshot {
    if (!this.session) throw new Error('Session not initialized');
    return {
      state: this.session.state,
      events: this.session.events as unknown as Record<string, unknown>[],
    };
  }
}
