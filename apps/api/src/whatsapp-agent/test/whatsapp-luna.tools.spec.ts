import type { ConfigService } from '@nestjs/config';
import type { WhatsAppBookingService } from '../whatsapp-booking.service';
import { WhatsAppLunaRunner } from '../whatsapp-luna.runner';

describe('WhatsAppLunaRunner booking tools', () => {
  it('exposes only the tool ids selected by the org tool profile', () => {
    const runner = new WhatsAppLunaRunner(
      {} as ConfigService,
      {} as WhatsAppBookingService,
    );
    const adk = {
      FunctionTool: class {
        name: string;
        constructor(config: { name: string }) {
          this.name = config.name;
        }
      },
    };
    const tools = (
      runner as unknown as {
        bookingTools: (
          adk: unknown,
          source: {
            organizationId: string;
            voiceAgentId: string;
            toolIds: string[];
          },
        ) => Array<{ name: string }>;
      }
    ).bookingTools(adk, {
      organizationId: 'org-1',
      voiceAgentId: 'agent-1',
      toolIds: ['lookupGhlContact', 'scheduleGhlMeeting'],
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'lookupGhlContact',
      'scheduleGhlMeeting',
    ]);
  });

  it('keeps string length limits out of OpenRouter schemas and enforces them before GHL', async () => {
    const booking = {
      lookupContact: jest.fn(),
      upsertContact: jest.fn(),
    };
    const runner = new WhatsAppLunaRunner(
      {} as ConfigService,
      booking as unknown as WhatsAppBookingService,
    );
    const adk = {
      FunctionTool: class {
        name: string;
        parameters: { safeParse: (input: unknown) => { success: boolean } };
        execute: (args: Record<string, string>, context?: unknown) => Promise<unknown>;
        constructor(config: {
          name: string;
          parameters: { safeParse: (input: unknown) => { success: boolean } };
          execute: (args: Record<string, string>, context?: unknown) => Promise<unknown>;
        }) {
          Object.assign(this, config);
        }
      },
    };
    const tools = (
      runner as unknown as {
        bookingTools: (
          adk: unknown,
          source: {
            organizationId: string;
            voiceAgentId: string;
            toolIds: string[];
          },
        ) => Array<{
          name: string;
          parameters: { safeParse: (input: unknown) => { success: boolean } };
          execute: (args: Record<string, string>, context?: unknown) => Promise<unknown>;
        }>;
      }
    ).bookingTools(adk, {
      organizationId: 'org-1',
      voiceAgentId: 'agent-1',
      toolIds: ['lookupGhlContact', 'upsertGhlContact'],
    });

    const lookup = tools.find((tool) => tool.name === 'lookupGhlContact')!;
    const upsert = tools.find((tool) => tool.name === 'upsertGhlContact')!;
    const longEmail = 'x'.repeat(256);
    expect(lookup.parameters.safeParse({ email: longEmail }).success).toBe(true);
    expect(upsert.parameters.safeParse({ email: longEmail }).success).toBe(true);
    await expect(lookup.execute({ email: longEmail })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_arguments',
    });
    await expect(upsert.execute({ email: longEmail })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_arguments',
    });
    expect(booking.lookupContact).not.toHaveBeenCalled();
    expect(booking.upsertContact).not.toHaveBeenCalled();
  });
});
