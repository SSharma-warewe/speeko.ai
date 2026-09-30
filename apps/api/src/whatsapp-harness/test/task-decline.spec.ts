import { isExplicitBookingDecline } from '../task-decline';

describe('task booking refusal evidence', () => {
  const session = {
    state: {},
    events: [
      {
        content: {
          role: 'model',
          parts: [{ text: 'Would you like to book a meeting?' }],
        },
      },
    ],
  };
  it.each([
    "I don't want to book a meeting",
    'Cancel my appointment',
    'No thanks',
  ])('accepts explicit current-message refusal: %s', (body) => {
    expect(isExplicitBookingDecline(body, body, session)).toBe(true);
  });
  it.each([
    'I want to book',
    'Do not cancel my appointment',
    'The tool failed',
    'I am not interested in cancelling my meeting',
  ])('rejects non-refusal: %s', (body) => {
    expect(isExplicitBookingDecline(body, body, session)).toBe(false);
  });
  it('rejects invented evidence and a short no without a booking invitation', () => {
    expect(
      isExplicitBookingDecline('Hello', "I don't want to book", session),
    ).toBe(false);
    expect(
      isExplicitBookingDecline('No', 'No', { state: {}, events: [] }),
    ).toBe(false);
  });
});
