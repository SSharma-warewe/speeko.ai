import { toSipDispatchRuleResponse } from '../mappers/sip-dispatch-rule-response.mapper';
import {
  SipDispatchRule,
  SipDispatchRuleType,
} from '../sip-dispatch-rule.entity';

describe('sip-dispatch-rule-response.mapper', () => {
  const base: SipDispatchRule = {
    id: 'rule-id',
    organizationId: 'org-id',
    name: 'Inbound agent routing',
    ruleType: SipDispatchRuleType.INDIVIDUAL,
    roomPrefix: 'call-',
    roomName: null,
    pin: '1234',
    randomize: false,
    sipTrunkIds: ['trunk-1'],
    hidePhoneNumber: false,
    attributes: { team: 'sales' },
    metadata: 'meta',
    organizationAgentId: 'org-agent-1',
    agentName: 'call-agent',
    livekitDispatchRuleId: 'SDR_abc',
    isActive: true,
    publishedAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as SipDispatchRule;

  describe('toSipDispatchRuleResponse', () => {
    it('1. status is draft when livekitDispatchRuleId is null', () => {
      const dto = toSipDispatchRuleResponse({
        ...base,
        livekitDispatchRuleId: null,
      } as SipDispatchRule);

      expect(dto.status).toBe('draft');
      expect(dto.livekitDispatchRuleId).toBeNull();
    });

    it('2. status is draft when livekitDispatchRuleId is whitespace-only', () => {
      const dto = toSipDispatchRuleResponse({
        ...base,
        livekitDispatchRuleId: '   ',
      } as SipDispatchRule);

      expect(dto.status).toBe('draft');
      expect(dto.livekitDispatchRuleId).toBeNull();
    });

    it('3. status is live when LiveKit id is present (trimmed)', () => {
      const dto = toSipDispatchRuleResponse({
        ...base,
        livekitDispatchRuleId: '  SDR_abc  ',
      } as SipDispatchRule);

      expect(dto.status).toBe('live');
      expect(dto.livekitDispatchRuleId).toBe('SDR_abc');
    });

    it('4. coerces non-array sipTrunkIds to empty array', () => {
      const dto = toSipDispatchRuleResponse({
        ...base,
        sipTrunkIds: null as unknown as string[],
      } as SipDispatchRule);

      expect(dto.sipTrunkIds).toEqual([]);
    });

    it('5. passes through pin, agentName, room fields, and attributes', () => {
      const dto = toSipDispatchRuleResponse(base);

      expect(dto).toEqual({
        id: base.id,
        organizationId: base.organizationId,
        name: base.name,
        ruleType: base.ruleType,
        roomPrefix: base.roomPrefix,
        roomName: base.roomName,
        pin: base.pin,
        randomize: base.randomize,
        sipTrunkIds: base.sipTrunkIds,
        hidePhoneNumber: base.hidePhoneNumber,
        attributes: base.attributes,
        metadata: base.metadata,
        organizationAgentId: base.organizationAgentId,
        agentName: base.agentName,
        livekitDispatchRuleId: 'SDR_abc',
        status: 'live',
        isActive: true,
        publishedAt: base.publishedAt,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      });
    });
  });
});
