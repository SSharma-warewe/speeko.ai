import {
  classifyUserTurn,
  lastUserTranscript,
} from '../tasks/user-turn';

describe('classifyUserTurn', () => {
  it('marks empty and filler as unusable', () => {
    expect(classifyUserTurn('')).toBe('empty');
    expect(classifyUserTurn('   ')).toBe('empty');
    expect(classifyUserTurn('Hello.')).toBe('filler');
    expect(classifyUserTurn('Hello?')).toBe('filler');
    expect(classifyUserTurn('Hi')).toBe('filler');
    expect(classifyUserTurn('So.')).toBe('filler');
    expect(classifyUserTurn('A')).toBe('filler');
    expect(classifyUserTurn('Thank you.')).toBe('filler');
    expect(classifyUserTurn('Uh-huh.')).toBe('filler');
    expect(classifyUserTurn('Hmm')).toBe('filler');
  });

  it('classifies yes / no / wrong person / already paid', () => {
    expect(classifyUserTurn('जी।')).toBe('yes');
    expect(classifyUserTurn('जी हाँ')).toBe('yes');
    expect(classifyUserTurn('हाँ')).toBe('yes');
    expect(classifyUserTurn('yes')).toBe('yes');
    expect(classifyUserTurn('नहीं')).toBe('no');
    expect(classifyUserTurn('Nahi, merko nahi chahiye.')).toBe('no');
    expect(classifyUserTurn('मैं शिवम नहीं हूँ')).toBe('wrong_person');
    expect(classifyUserTurn('wrong person')).toBe('wrong_person');
    expect(classifyUserTurn('यह किस्त हो चुकी है')).toBe('already_paid');
    expect(classifyUserTurn('I already paid')).toBe('already_paid');
  });

  it('treats real phrases as content', () => {
    expect(classifyUserTurn('हाँ, मैं शिवम हूँ।')).toBe('content');
    expect(classifyUserTurn('आज कर दूंगा')).toBe('content');
    expect(classifyUserTurn('पैसे नहीं थे मेरे पास')).toBe('content');
  });
});

describe('lastUserTranscript', () => {
  it('reads the last user message from history items', () => {
    expect(
      lastUserTranscript({
        history: {
          items: [
            { role: 'assistant', content: 'नमस्ते' },
            { role: 'user', content: 'Hello.' },
            { role: 'user', content: ['हाँ, मैं शिवम हूँ।'] },
          ],
        },
      }),
    ).toBe('हाँ, मैं शिवम हूँ।');
  });

  it('returns empty when history is missing', () => {
    expect(lastUserTranscript(null)).toBe('');
    expect(lastUserTranscript({})).toBe('');
  });
});
