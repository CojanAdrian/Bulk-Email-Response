const { looksLikeAutomatedNotification } = require('../../src/lib/notificationFilter');

describe('looksLikeAutomatedNotification', () => {
  test('flags a bare noreply@ sender', () => {
    const message = { from: 'noreply@truckertools.com', subject: 'Load# 0807261 -  view the real-time location of this load using Load Track' };
    expect(looksLikeAutomatedNotification(message)).toBe(true);
  });

  test('flags a "Name <loadlock@...>" style sender', () => {
    const message = { from: '"\'Highway\' via Loadlock" <Loadlock@igtfreight.com>', subject: 'New Load Lock Alert for 0084188' };
    expect(looksLikeAutomatedNotification(message)).toBe(true);
  });

  test('flags a real person\'s address when the subject is a "Tendered" shipment notification', () => {
    const message = { from: 'Daisy Carchilan <daisy@igtfreight.com>', subject: 'Re: Shipment 60115349232 Tendered for IGT Logistics Inc' };
    expect(looksLikeAutomatedNotification(message)).toBe(true);
  });

  test('flags a subject mentioning real-time location tracking', () => {
    const message = { from: 'someone@example.com', subject: 'view the real-time location of this load' };
    expect(looksLikeAutomatedNotification(message)).toBe(true);
  });

  test('flags a subject mentioning a load lock alert', () => {
    const message = { from: 'someone@example.com', subject: 'New Load Lock Alert for 0084188' };
    expect(looksLikeAutomatedNotification(message)).toBe(true);
  });

  test('does not flag an ordinary carrier inquiry', () => {
    const message = { from: 'dispatch@carrierco.com', subject: 'Load #4521 availability' };
    expect(looksLikeAutomatedNotification(message)).toBe(false);
  });

  test('does not flag a sender whose address merely contains "track" mid-word', () => {
    const message = { from: 'contracts@carrierco.com', subject: 'Is this load still available?' };
    expect(looksLikeAutomatedNotification(message)).toBe(false);
  });

  test('handles a missing subject without throwing', () => {
    const message = { from: 'dispatch@carrierco.com' };
    expect(looksLikeAutomatedNotification(message)).toBe(false);
  });

  test('handles a missing from header without throwing', () => {
    const message = { subject: 'Is this load still available?' };
    expect(looksLikeAutomatedNotification(message)).toBe(false);
  });
});
