import {
  visibleReplyText,
  withoutThoughtParts,
} from '../lib/visible-reply';

describe('visible WhatsApp reply', () => {
  it('drops Luna reasoning and keeps the answer', () => {
    expect(
      visibleReplyText({
        content: {
          parts: [
            { text: 'The user wants a demo. I should ask one question.', thought: true },
            { text: '  What should the calls do?  ' },
          ],
        },
      }),
    ).toBe('What should the calls do?');
  });

  it('returns empty when the turn is only reasoning', () => {
    expect(
      visibleReplyText({
        content: { parts: [{ text: 'Still deciding.', thought: true }] },
      }),
    ).toBe('');
  });

  it('leaves a response unchanged when it has no thought parts', () => {
    const response = { content: { role: 'model', parts: [{ text: 'Hello' }] } };
    expect(withoutThoughtParts(response)).toBeUndefined();
  });

  it('strips thought parts before the session stores the turn', () => {
    expect(
      withoutThoughtParts({
        content: {
          role: 'model',
          parts: [
            { text: 'Reasoning.', thought: true },
            { text: 'Happy to help.' },
          ],
        },
        turnComplete: true,
      }),
    ).toEqual({
      content: { role: 'model', parts: [{ text: 'Happy to help.' }] },
      turnComplete: true,
    });
  });
});
