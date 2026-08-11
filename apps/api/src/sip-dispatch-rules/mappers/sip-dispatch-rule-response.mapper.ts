import { SipDispatchRuleResponseDto } from '../dto/sip-dispatch-rule-response.dto';
import { SipDispatchRule } from '../sip-dispatch-rule.entity';

export function toSipDispatchRuleResponse(
  row: SipDispatchRule,
): SipDispatchRuleResponseDto {
  const livekitId = row.livekitDispatchRuleId?.trim() || null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    ruleType: row.ruleType,
    roomPrefix: row.roomPrefix,
    roomName: row.roomName,
    pin: row.pin,
    randomize: row.randomize,
    sipTrunkIds: Array.isArray(row.sipTrunkIds) ? row.sipTrunkIds : [],
    hidePhoneNumber: row.hidePhoneNumber,
    attributes: row.attributes ?? null,
    metadata: row.metadata,
    organizationAgentId: row.organizationAgentId,
    agentName: row.agentName,
    livekitDispatchRuleId: livekitId,
    status: livekitId ? 'live' : 'draft',
    isActive: row.isActive,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
