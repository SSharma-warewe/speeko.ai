import { livekitHttpHost } from '../livekit-url.util';

describe('livekitHttpHost', () => {
  it('1. wss:// → https://', () => {
    expect(livekitHttpHost('wss://proj.livekit.cloud')).toBe(
      'https://proj.livekit.cloud',
    );
  });

  it('2. ws:// → http://', () => {
    expect(livekitHttpHost('ws://localhost:7880')).toBe(
      'http://localhost:7880',
    );
  });

  it('3. https:// pass-through', () => {
    expect(livekitHttpHost('https://already.https')).toBe(
      'https://already.https',
    );
  });

  it('4. http:// pass-through', () => {
    expect(livekitHttpHost('http://already.http')).toBe('http://already.http');
  });

  it('5. bare host / no scheme pass-through', () => {
    expect(livekitHttpHost('proj.livekit.cloud')).toBe('proj.livekit.cloud');
  });

  it('6. wss:// only → https://', () => {
    expect(livekitHttpHost('wss://')).toBe('https://');
  });
});
