import { EventEmitter } from 'node:events';

class Queue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiter?: (v: IteratorResult<T>) => void;
  private closed = false;
  put(value: T) {
    if (this.waiter) {
      const wait = this.waiter;
      this.waiter = undefined;
      wait({ value, done: false });
    } else this.values.push(value);
  }
  end() {
    this.closed = true;
    this.waiter?.({ value: undefined, done: true });
    this.waiter = undefined;
  }
  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<T>> =>
        this.values.length
          ? Promise.resolve({ value: this.values.shift()!, done: false })
          : this.closed
            ? Promise.resolve({ value: undefined, done: true })
            : new Promise((resolve) => {
                this.waiter = resolve;
              }),
    };
  }
}
const providers: FakeProvider[] = [];
class FakeProvider extends EventEmitter {
  events = new Queue<unknown>();
  frames: unknown[] = [];
  ended = false;
  constructor(public options: unknown) {
    super();
    providers.push(this);
  }
  stream() {
    return {
      pushFrame: (frame: unknown) => this.frames.push(frame),
      endInput: () => {
        if (this.ended) return;
        this.ended = true;
        this.events.put({
          type: 2,
          alternatives: [{ text: 'अंतिम goodbye', startTime: 0 }],
        });
        this.events.put({ type: 4, recognitionUsage: { audioDuration: 1 } });
        this.events.end();
      },
      close: () => this.events.end(),
      [Symbol.asyncIterator]: () => this.events[Symbol.asyncIterator](),
    };
  }
  async close() {}
}
jest.mock('@livekit/agents', () => ({
  AutoSubscribe: { SUBSCRIBE_NONE: 1 },
  stt: {
    SpeechEventType: {
      START_OF_SPEECH: 0,
      FINAL_TRANSCRIPT: 2,
      RECOGNITION_USAGE: 4,
    },
  },
}));
jest.mock('@livekit/rtc-node', () => ({
  DisconnectReason: { ROOM_DELETED: 5 },
  TrackKind: { KIND_AUDIO: 1 },
  TrackSource: { SOURCE_MICROPHONE: 2 },
  RoomEvent: {
    Disconnected: 'disconnected',
    TrackSubscribed: 'trackSubscribed',
    ParticipantAttributesChanged: 'attributes',
  },
  AudioStream: jest.fn().mockImplementation(() => {
    let finish!: (v: unknown) => void;
    return {
      getReader: () => ({
        read: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        cancel: async () => {
          finish?.({ done: true });
        },
      }),
    };
  }),
}));
jest.mock('../../sarvam/plugin-stt', () => ({
  SarvamPluginSTT: FakeProvider,
  resolveSarvamRealtimePluginUrl: () => 'ws://127.0.0.1:8091/stt',
}));
import { HumanTranscriptionJobRunner } from '../../session/human-transcription-job';

const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function harness(status = 'active') {
  const room = Object.assign(new EventEmitter(), {
    remoteParticipants: new Map<string, unknown>(),
  });
  const pub = () => ({
    kind: 1,
    source: 2,
    subscribed: false,
    track: {},
    setSubscribed: jest.fn(function (this: { subscribed: boolean }) {
      this.subscribed = true;
    }),
  });
  const caller = pub(),
    contact = pub();
  room.remoteParticipants.set('browser', {
    identity: 'browser',
    trackPublications: new Map([['mic', caller]]),
  });
  room.remoteParticipants.set('sip', {
    identity: 'sip',
    attributes: { 'sip.callStatus': status },
    trackPublications: new Map([['mic', contact]]),
  });
  const stranger = pub();
  room.remoteParticipants.set('stranger', {
    identity: 'stranger',
    trackPublications: new Map([['mic', stranger]]),
  });
  const ctx = {
    job: { id: 'job', room: { name: 'human-room' } },
    room,
    connect: jest.fn(),
    shutdown: jest.fn(),
    addShutdownCallback: jest.fn(),
  };
  const requests: { path: string; payload: any }[] = [];
  const client = {
    postJson: jest.fn(async (path, payload) => {
      requests.push({ path, payload });
      return {
        ok: true,
        text: JSON.stringify(
          path.endsWith('/start')
            ? {
                callbackToken: 'test-token',
                browserIdentity: 'browser',
                sipIdentity: 'sip',
              }
            : { ok: true },
        ),
      };
    }),
  };
  const runner = new HumanTranscriptionJobRunner(
    ctx as never,
    { mode: 'human_transcription', callId: 'call', roomName: 'human-room' },
    client as never,
  );
  return { ctx, room, caller, contact, stranger, requests, runner };
}
describe('silent human transcription listener', () => {
  const previous = process.env.SARVAM_API_KEY;
  beforeEach(() => {
    providers.length = 0;
    process.env.SARVAM_API_KEY = 'test-placeholder';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previous;
  });
  it('listens to both authoritative speakers, ignores strangers and interims, and drains final speech at hang-up', async () => {
    const h = harness();
    await h.runner.run();
    expect(providers).toHaveLength(2);
    expect(providers[0].options).toMatchObject({
      language: 'auto',
      streamType: 'balanced',
      mode: 'codemix',
    });
    expect(h.stranger.setSubscribed).not.toHaveBeenCalled();
    providers[0].events.put({
      type: 1,
      alternatives: [{ text: 'unfinished' }],
    });
    providers[0].events.put({
      type: 2,
      alternatives: [{ text: 'नमस्ते hello', startTime: 0 }],
    });
    providers[1].events.put({
      type: 2,
      alternatives: [{ text: 'Yes हाँ', startTime: 0 }],
    });
    await settle();
    await h.runner.finish();
    const segments = h.requests.flatMap((r) => r.payload.segments ?? []);
    expect(segments.map((s) => s.content)).not.toContain('unfinished');
    expect(segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'caller', content: 'नमस्ते hello' }),
        expect.objectContaining({ role: 'contact', content: 'Yes हाँ' }),
        expect.objectContaining({ content: 'अंतिम goodbye' }),
      ]),
    );
    expect(h.requests.at(-1)!.payload.audioDuration).toBe(2);
    expect(h.requests.at(-1)!.payload.partial).toBe(false);
    expect(h.ctx.connect).toHaveBeenCalledWith(undefined, 1);
    await h.runner.finish();
    expect(h.requests.filter((r) => r.path.endsWith('/finish'))).toHaveLength(
      1,
    );
  });
  it('waits for SIP answer, keeps mute from creating duplicate streams and handles track replacement', async () => {
    const h = harness('ringing');
    await h.runner.run();
    expect(providers).toHaveLength(0);
    (h.room.remoteParticipants.get('sip') as any).attributes['sip.callStatus'] =
      'active';
    h.room.emit('attributes');
    expect(providers).toHaveLength(2);
    h.caller.subscribed = true;
    h.room.emit('trackSubscribed');
    expect(providers).toHaveLength(2);
    h.caller.track = {};
    h.room.emit('trackSubscribed');
    expect(providers).toHaveLength(3);
    await h.runner.finish();
  });
  it('marks provider failure as partial without reconnecting or ending the human call', async () => {
    const h = harness();
    await h.runner.run();
    providers[0].emit('error', new Error('unavailable'));
    await settle();
    h.room.emit('trackSubscribed');
    expect(providers).toHaveLength(2);
    expect(h.ctx.shutdown).not.toHaveBeenCalled();
    await h.runner.finish();
    expect(h.requests.at(-1)!.payload.partial).toBe(true);
  });
  it('handles missing keys without constructing a provider or failing the call', async () => {
    delete process.env.SARVAM_API_KEY;
    const h = harness();
    await h.runner.run();
    expect(providers).toHaveLength(0);
    expect(h.ctx.shutdown).not.toHaveBeenCalled();
    await h.runner.finish();
    expect(h.requests.at(-1)!.payload.partial).toBe(true);
  });
});
