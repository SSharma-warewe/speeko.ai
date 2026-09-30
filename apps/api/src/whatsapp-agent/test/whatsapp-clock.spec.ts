import { buildWhatsAppInstruction } from '@call-agent/contracts';

describe('WhatsApp model clock', () => {
  it('uses the sender timezone and resolves dates across local midnight', () => {
    const before = buildWhatsAppInstruction(
      'Receptionist rules',
      'org-id:919876543210',
      new Date('2026-09-29T18:20:00Z'),
    );
    const after = buildWhatsAppInstruction(
      'Receptionist rules',
      'org-id:919876543210',
      new Date('2026-09-29T18:40:00Z'),
    );

    expect(before).toContain('Asia/Kolkata');
    expect(before).toContain('at 11:50:00 PM');
    expect(before).toContain('Today: Tuesday September 29, 2026 (2026-09-29)');
    expect(before).toContain('Tomorrow: Wednesday September 30, 2026');
    expect(after).toContain('Today: Wednesday September 30, 2026 (2026-09-30)');
    expect(after).toContain('at 12:10:00 AM');
    expect(after).toContain('Tomorrow: Thursday October 1, 2026');
    expect(after).toContain('UTC now: 2026-09-29T18:40:00.000Z');
  });

  it('provides a UTC clock when the sender timezone is unknown', () => {
    const instruction = buildWhatsAppInstruction(
      'Receptionist rules',
      'org-id:999123456789',
      new Date('2026-09-29T10:00:00Z'),
    );

    expect(instruction).toContain(
      'Timezone inferred from the WhatsApp sender: UTC',
    );
    expect(instruction).toContain('Today: Tuesday September 29, 2026');
    expect(instruction).toContain('without Z plus an IANA timezone');
  });
});
