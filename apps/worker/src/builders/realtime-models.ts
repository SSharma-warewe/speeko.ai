import { llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as xai from '@livekit/agents-plugin-xai';
import { stripRealtimeUnsupportedChatItems } from './realtime-chat-ctx.js';

class SpeekoOpenaiRealtimeSession extends openai.realtime.RealtimeSession {
  protected override async createChatCtxUpdateEvents(
    chatCtx: llm.ChatContext,
    addMockAudio: boolean = false,
  ) {
    return super.createChatCtxUpdateEvents(
      stripRealtimeUnsupportedChatItems(chatCtx),
      addMockAudio,
    );
  }
}

export class SpeekoOpenaiRealtimeModel extends openai.realtime.RealtimeModel {
  override session(): openai.realtime.RealtimeSession {
    return new SpeekoOpenaiRealtimeSession(this);
  }
}

class SpeekoXaiRealtimeSession extends xai.realtime.RealtimeSession {
  protected override async createChatCtxUpdateEvents(
    chatCtx: llm.ChatContext,
    addMockAudio: boolean = false,
  ) {
    return super.createChatCtxUpdateEvents(
      stripRealtimeUnsupportedChatItems(chatCtx),
      addMockAudio,
    );
  }
}

export class SpeekoXaiRealtimeModel extends xai.realtime.RealtimeModel {
  override session(): xai.realtime.RealtimeSession {
    return new SpeekoXaiRealtimeSession(this);
  }
}
