import { Agent, AgentDirection } from '../agent.entity';
import {
  toAgentTemplateResponse,
  toOrganizationAgentResponse,
} from '../mappers/agent-response.mapper';
import { OrganizationAgent } from '../organization-agent.entity';

describe('agent-response.mapper', () => {
  const template: Agent = {
    id: 'template-id',
    key: 'inbound',
    name: 'Inbound template',
    direction: AgentDirection.INBOUND,
    description: 'Platform inbound',
    systemPrompt: 'Template persona',
    onEnterInstructions: 'Say hi',
    onExitInstructions: null,
    defaultTaskKey: 'general',
    defaultToolProfileId: 'profile-template',
    voice: 'template-voice',
    model: 'template-model',
    temperature: 0.5,
    speakingRate: 1.1,
    deliveryMode: 'STABLE',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as Agent;

  describe('toAgentTemplateResponse', () => {
    it('1. omits org-only fields (slug, organizationId, agentId, templateKey, calendarIntegrationId)', () => {
      const dto = toAgentTemplateResponse(template, ['endCall']);

      expect(dto).not.toHaveProperty('slug');
      expect(dto).not.toHaveProperty('organizationId');
      expect(dto).not.toHaveProperty('agentId');
      expect(dto).not.toHaveProperty('templateKey');
      expect(dto).not.toHaveProperty('calendarIntegrationId');
    });

    it('2. maps toolProfileId from defaultToolProfileId', () => {
      const dto = toAgentTemplateResponse(template);

      expect(dto.toolProfileId).toBe('profile-template');
    });

    it('3. defaultTaskKey falls back to general when null/undefined', () => {
      const dto = toAgentTemplateResponse({
        ...template,
        defaultTaskKey: null as unknown as string,
      } as Agent);

      expect(dto.defaultTaskKey).toBe('general');
    });

    it('4. hooks undefined become null', () => {
      const dto = toAgentTemplateResponse({
        ...template,
        onEnterInstructions: undefined as unknown as null,
        onExitInstructions: undefined as unknown as null,
      } as Agent);

      expect(dto.prompt.onEnterInstructions).toBeNull();
      expect(dto.prompt.onExitInstructions).toBeNull();
    });

    it('5. passes enabledTools through', () => {
      const dto = toAgentTemplateResponse(template, [
        'endCall',
        'confirmAppointment',
      ]);

      expect(dto.enabledTools).toEqual(['endCall', 'confirmAppointment']);
    });

    it('5b. preserves empty-string hooks (silent) vs null', () => {
      const dto = toAgentTemplateResponse({
        ...template,
        onEnterInstructions: '',
        onExitInstructions: null,
      } as Agent);

      expect(dto.prompt.onEnterInstructions).toBe('');
      expect(dto.prompt.onExitInstructions).toBeNull();
    });
  });

  describe('toOrganizationAgentResponse', () => {
    const orgAgent: OrganizationAgent = {
      id: 'org-agent-id',
      organizationId: 'org-id',
      agentId: template.id,
      name: 'Booking confirmations',
      slug: 'booking-confirmations',
      systemPrompt: 'Org persona',
      onEnterInstructions: '',
      onExitInstructions: 'Bye',
      toolProfileId: 'profile-org',
      calendarIntegrationId: 'cal-1',
      defaultTaskKey: 'confirm_appointment',
      voice: 'org-voice',
      model: null,
      temperature: null,
      speakingRate: null,
      deliveryMode: null,
      isActive: false,
      createdAt: new Date('2024-01-03T00:00:00.000Z'),
      updatedAt: new Date('2024-01-04T00:00:00.000Z'),
      agent: template,
    } as OrganizationAgent;

    it('6. throws plain Error when agent relation is missing', () => {
      const bare = {
        ...orgAgent,
        agent: undefined,
      } as unknown as OrganizationAgent;

      expect(() => toOrganizationAgentResponse(bare)).toThrow(Error);
      expect(() => toOrganizationAgentResponse(bare)).toThrow(
        `OrganizationAgent ${orgAgent.id} loaded without agent relation`,
      );
    });

    it('7. key/templateKey from template; name/slug prefer org row', () => {
      const dto = toOrganizationAgentResponse(orgAgent);

      expect(dto.key).toBe('inbound');
      expect(dto.templateKey).toBe('inbound');
      expect(dto.name).toBe('Booking confirmations');
      expect(dto.slug).toBe('booking-confirmations');
    });

    it('7b. empty org name/slug fall back to template name/key', () => {
      const dto = toOrganizationAgentResponse({
        ...orgAgent,
        name: '',
        slug: '',
      } as OrganizationAgent);

      expect(dto.name).toBe(template.name);
      expect(dto.slug).toBe(template.key);
    });

    it('8. direction and description always come from template', () => {
      const dto = toOrganizationAgentResponse(orgAgent);

      expect(dto.direction).toBe(AgentDirection.INBOUND);
      expect(dto.description).toBe('Platform inbound');
    });

    it('9. isActive comes from org row only (not template)', () => {
      const dto = toOrganizationAgentResponse(orgAgent);

      expect(template.isActive).toBe(true);
      expect(dto.isActive).toBe(false);
    });

    it('10. inbound defaultTaskKey: stored, else template, else general; outbound always null', () => {
      expect(
        toOrganizationAgentResponse({
          ...orgAgent,
          defaultTaskKey: null as unknown as string,
          agent: { ...template, defaultTaskKey: 'survey' },
        } as OrganizationAgent).defaultTaskKey,
      ).toBe('survey');

      expect(
        toOrganizationAgentResponse({
          ...orgAgent,
          defaultTaskKey: null as unknown as string,
          agent: {
            ...template,
            defaultTaskKey: null as unknown as string,
          },
        } as OrganizationAgent).defaultTaskKey,
      ).toBe('general');

      expect(
        toOrganizationAgentResponse(orgAgent).defaultTaskKey,
      ).toBe('confirm_appointment');

      expect(
        toOrganizationAgentResponse({
          ...orgAgent,
          defaultTaskKey: 'confirm_appointment',
          agent: {
            ...template,
            key: 'outbound',
            direction: AgentDirection.OUTBOUND,
            defaultTaskKey: 'general',
          },
        } as OrganizationAgent).defaultTaskKey,
      ).toBeNull();
    });

    it('11. voice/model/temperature/speakingRate/deliveryMode fall back to template when org null', () => {
      const dto = toOrganizationAgentResponse({
        ...orgAgent,
        voice: null,
        model: null,
        temperature: null,
        speakingRate: null,
        deliveryMode: null,
      } as OrganizationAgent);

      expect(dto.voice).toBe('template-voice');
      expect(dto.model).toBe('template-model');
      expect(dto.temperature).toBe(0.5);
      expect(dto.speakingRate).toBe(1.1);
      expect(dto.deliveryMode).toBe('STABLE');
    });

    it('12. org voice wins over template voice', () => {
      const dto = toOrganizationAgentResponse({
        ...orgAgent,
        speakingRate: 0.8,
        deliveryMode: 'CREATIVE',
      } as OrganizationAgent);

      expect(dto.voice).toBe('org-voice');
      expect(dto.model).toBe('template-model');
      expect(dto.speakingRate).toBe(0.8);
      expect(dto.deliveryMode).toBe('CREATIVE');
    });

    it('13. calendarIntegrationId null-coalesced; includes org + agent ids', () => {
      const withCal = toOrganizationAgentResponse(orgAgent);
      expect(withCal.calendarIntegrationId).toBe('cal-1');
      expect(withCal.organizationId).toBe('org-id');
      expect(withCal.agentId).toBe(template.id);
      expect(withCal.prompt.systemPrompt).toBe('Org persona');
      expect(withCal.prompt.onEnterInstructions).toBe('');

      const cleared = toOrganizationAgentResponse({
        ...orgAgent,
        calendarIntegrationId: null,
      } as OrganizationAgent);
      expect(cleared.calendarIntegrationId).toBeNull();
    });
  });
});
