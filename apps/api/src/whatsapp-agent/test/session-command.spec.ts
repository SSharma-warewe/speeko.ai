import { isNewSessionCommand } from '../lib/session-command';

describe('isNewSessionCommand', () => {
  it('matches /new after trim, any letter case', () => {
    expect(isNewSessionCommand('/new')).toBe(true);
    expect(isNewSessionCommand(' /NEW ')).toBe(true);
    expect(isNewSessionCommand('/New')).toBe(true);
  });

  it('leaves extra words as a normal turn', () => {
    expect(isNewSessionCommand('/new please')).toBe(false);
    expect(isNewSessionCommand('please /new')).toBe(false);
    expect(isNewSessionCommand('new')).toBe(false);
    expect(isNewSessionCommand('/newest')).toBe(false);
  });
});
