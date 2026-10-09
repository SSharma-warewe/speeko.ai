import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { initializeLogger, stt } from '@livekit/agents';
import { SarvamPluginSTT } from '../../sarvam/plugin-stt';

describe('Sarvam loopback stream drain', () => {
  beforeAll(() => {
    initializeLogger({ pretty: false, level: 'silent' });
  });
  it.each([true, false])(
    'keeps the final audio tail and late transcript; drain acknowledgement=%s',
    async (acknowledge) => {
      const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
      await once(server, 'listening');
      let pcmBytes = 0,
        mode: string | null = null;
      server.on('connection', (ws, request) => {
        mode = new URL(request.url!, 'http://localhost').searchParams.get(
          'mode',
        );
        ws.on('message', (data, binary) => {
          if (binary) {
            pcmBytes += data.length;
            return;
          }
          if (JSON.parse(data.toString()).event !== 'end') return;
          setTimeout(() => {
            ws.send(
              JSON.stringify({
                type: 'final',
                text: 'अंतिम goodbye',
                language: 'hi-IN',
              }),
            );
            ws.send(JSON.stringify({ type: 'usage', audioDuration: 0.01 }));
            if (acknowledge) ws.send(JSON.stringify({ type: 'drained' }));
            ws.close();
          }, 15);
        });
      });
      const port = (server.address() as { port: number }).port;
      const provider = new SarvamPluginSTT({
        url: `ws://127.0.0.1:${port}/stt`,
        apiKey: 'test-placeholder',
        language: 'auto',
        streamType: 'balanced',
        mode: 'codemix',
      });
      const failures: unknown[] = [];
      provider.on('error', (error) => failures.push(error));
      const stream = provider.stream();
      try {
        // 10ms is smaller than the adapter's 50ms chunk; endInput must flush it.
        stream.pushFrame({
          data: new Int16Array(160),
          sampleRate: 16000,
          channels: 1,
          samplesPerChannel: 160,
        } as never);
        stream.endInput();
        const events: stt.SpeechEvent[] = [];
        for await (const event of stream) events.push(event);
        expect(pcmBytes).toBe(320);
        expect(mode).toBe('codemix');
        expect(
          events.find((e) => e.type === stt.SpeechEventType.FINAL_TRANSCRIPT)
            ?.alternatives?.[0].text,
        ).toBe('अंतिम goodbye');
        expect(
          events.find((e) => e.type === stt.SpeechEventType.RECOGNITION_USAGE)
            ?.recognitionUsage?.audioDuration,
        ).toBe(0.01);
        expect(failures.length).toBe(acknowledge ? 0 : 1);
      } finally {
        stream.close();
        await provider.close();
        for (const ws of server.clients) ws.terminate();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
