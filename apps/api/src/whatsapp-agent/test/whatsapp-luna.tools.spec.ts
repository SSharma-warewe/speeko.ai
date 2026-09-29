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
});
