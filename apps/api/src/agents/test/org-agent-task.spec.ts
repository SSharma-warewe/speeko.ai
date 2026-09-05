import { BadRequestException } from '@nestjs/common';
import { Agent, AgentDirection } from '../agent.entity';
import { OrganizationAgent } from '../organization-agent.entity';
import {
  INBOUND_TASK_REQUIRED,
  orgAgentDefaultTaskKey,
  OUTBOUND_NO_DEFAULT_TASK,
  storedDefaultTaskKey,
} from '../org-agent-task';

describe('org-agent-task', () => {
  const inbound = { direction: AgentDirection.INBOUND } as Agent;
  const outbound = { direction: AgentDirection.OUTBOUND } as Agent;

  describe('storedDefaultTaskKey', () => {
    it('outbound ignores omit and rejects a sent key', () => {
      expect(storedDefaultTaskKey(AgentDirection.OUTBOUND, undefined, 'general')).toBeNull();
      expect(() =>
        storedDefaultTaskKey(AgentDirection.OUTBOUND, 'demo_booking', 'general'),
      ).toThrow(BadRequestException);
      expect(() =>
        storedDefaultTaskKey(AgentDirection.OUTBOUND, 'demo_booking', 'general'),
      ).toThrow(OUTBOUND_NO_DEFAULT_TASK);
    });

    it('inbound uses dto, then template, then general', () => {
      expect(
        storedDefaultTaskKey(AgentDirection.INBOUND, 'demo_booking', 'general'),
      ).toBe('demo_booking');
      expect(
        storedDefaultTaskKey(AgentDirection.INBOUND, '  ', 'interview_booking'),
      ).toBe('interview_booking');
      expect(storedDefaultTaskKey(AgentDirection.INBOUND, undefined, null)).toBe(
        'general',
      );
    });
  });

  describe('orgAgentDefaultTaskKey', () => {
    it('outbound always null even with leftover stored key', () => {
      expect(
        orgAgentDefaultTaskKey(
          { defaultTaskKey: 'demo_booking', agent: outbound } as OrganizationAgent,
          outbound,
        ),
      ).toBeNull();
    });

    it('inbound stored then template then general', () => {
      expect(
        orgAgentDefaultTaskKey(
          {
            defaultTaskKey: 'interview_booking',
            agent: inbound,
          } as OrganizationAgent,
          { ...inbound, defaultTaskKey: 'general' },
        ),
      ).toBe('interview_booking');
      expect(
        orgAgentDefaultTaskKey(
          { defaultTaskKey: null, agent: inbound } as OrganizationAgent,
          { ...inbound, defaultTaskKey: 'demo_booking' },
        ),
      ).toBe('demo_booking');
      expect(
        orgAgentDefaultTaskKey(
          { defaultTaskKey: null, agent: inbound } as OrganizationAgent,
          { ...inbound, defaultTaskKey: null as unknown as string },
        ),
      ).toBe('general');
    });
  });

  it('exports inbound required copy for PATCH', () => {
    expect(INBOUND_TASK_REQUIRED).toMatch(/require a default task/i);
  });
});
