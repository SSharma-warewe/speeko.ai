import { ValidationPipe } from '@nestjs/common';
import { CallMedium, resolveTtsCacheEnabled } from '@call-agent/contracts';
import { Agent } from '../agent.entity';
import { OrganizationAgent } from '../organization-agent.entity';
import { UpdateAgentDto } from '../dto/update-agent.dto';
import { UpdateOrganizationAgentDto } from '../dto/update-organization-agent.dto';
import { applyVoicePatch, resolveVoiceRuntime } from '../voice-settings';
import {
  toAgentTemplateResponse,
  toOrganizationAgentResponse,
} from '../mappers/agent-response.mapper';
import { packOrgAgentJobMetadata } from '../job-metadata';

describe('persisted speech-cache policy', () => {
  it.each([true, false, null])(
    'template %s resolves with platform default off',
    (preference) => {
      const template = { ttsCacheEnabled: preference } as Agent;
      expect(toAgentTemplateResponse(template)).toMatchObject({
        ttsCacheEnabled: preference,
        ttsCacheDefaultEnabled: false,
        effectiveTtsCacheEnabled: preference === true,
      });
    },
  );
  describe.each([true, false, null])('template=%s', (defaultValue) => {
    it.each([true, false, null])(
      'org=%s preserves raw preference in responses and resolves dispatch',
      (preference) => {
        const template = {
          ttsCacheEnabled: defaultValue,
          key: 'fixture',
        } as Agent;
        const row = {
          ttsCacheEnabled: preference,
          agent: template,
        } as OrganizationAgent;
        const expected = (preference ?? defaultValue) === true;
        expect(toOrganizationAgentResponse(row)).toMatchObject({
          ttsCacheEnabled: preference,
          ttsCacheDefaultEnabled: defaultValue === true,
          effectiveTtsCacheEnabled: expected,
        });
        for (const direction of ['inbound', 'outbound'] as const) {
          for (const medium of [CallMedium.SIP, CallMedium.WEB]) {
            expect(
              packOrgAgentJobMetadata(row, {
                direction,
                medium,
                task: 'general',
                enabledTools: ['endCall'],
              }).ttsCacheEnabled,
            ).toBe(expected);
          }
        }
      },
    );
  });
  it('native realtime ignores a retained true preference, while Bulbul pipeline realtime is eligible', () => {
    const row = {
      ttsCacheEnabled: true,
      model: 'openai/gpt-realtime-2.1',
      voice: 'marin',
    };
    applyVoicePatch(row, {});
    expect(row.ttsCacheEnabled).toBe(true);
    expect(resolveVoiceRuntime(row).ttsCacheEnabled).toBe(false);
    expect(toAgentTemplateResponse(row as Agent)).toMatchObject({
      ttsCacheEnabled: true,
      effectiveTtsCacheEnabled: false,
    });
    applyVoicePatch(row, { model: null, voice: null });
    expect(
      resolveVoiceRuntime({ ...row, ttsModel: 'sarvam/bulbul-v3-realtime' })
        .ttsCacheEnabled,
    ).toBe(true);
  });
  it('omission preserves a preference and null restores inheritance', () => {
    const row = { ttsCacheEnabled: false };
    applyVoicePatch(row, { temperature: 0.3 });
    expect(row.ttsCacheEnabled).toBe(false);
    applyVoicePatch(row, { ttsCacheEnabled: null });
    expect(row.ttsCacheEnabled).toBeNull();
    expect(
      resolveVoiceRuntime(row, { ttsCacheEnabled: true }).ttsCacheEnabled,
    ).toBe(true);
    expect(resolveTtsCacheEnabled(undefined)).toBe(false);
  });
  describe.each([UpdateAgentDto, UpdateOrganizationAgentDto])(
    '%p strict HTTP validation',
    (metatype) => {
      const pipe = new ValidationPipe({
        transform: true,
      transformOptions: { enableImplicitConversion: true },
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      it.each([true, false, null, undefined])(
        'accepts %s without coercion',
        async (value) => {
          const body = value === undefined ? {} : { ttsCacheEnabled: value };
          const result = await pipe.transform(body, { type: 'body', metatype });
          expect(result.ttsCacheEnabled).toBe(value);
        },
      );
      it.each(['true', 'false', 'null', 0, 1, [], {}])(
        'rejects %j',
        async (value) => {
          await expect(
            pipe.transform(
              { ttsCacheEnabled: value },
              { type: 'body', metatype },
            ),
          ).rejects.toMatchObject({ status: 400 });
        },
      );
    },
  );
});
