import { ConfigService } from '@nestjs/config';
import { SIPTransport } from '@livekit/protocol';

type RoomClientMock = {
  createRoom: jest.Mock;
  deleteRoom: jest.Mock;
  listParticipants: jest.Mock;
};

type DispatchClientMock = {
  createDispatch: jest.Mock;
};

type SipClientMock = {
  createSipOutboundTrunk: jest.Mock;
  listSipOutboundTrunk: jest.Mock;
  createSipInboundTrunk: jest.Mock;
  createSipDispatchRule: jest.Mock;
  deleteSipTrunk: jest.Mock;
  deleteSipDispatchRule: jest.Mock;
  createSipParticipant: jest.Mock;
  updateSipOutboundTrunkFields: jest.Mock;
};

type AccessTokenInstance = {
  addGrant: jest.Mock;
  toJwt: jest.Mock;
  ctorArgs: unknown[];
};

const roomClientInstances: RoomClientMock[] = [];
const dispatchClientInstances: DispatchClientMock[] = [];
const sipClientInstances: SipClientMock[] = [];
const accessTokenInstances: AccessTokenInstance[] = [];

jest.mock('livekit-server-sdk', () => {
  class RoomServiceClient {
    createRoom = jest.fn();
    deleteRoom = jest.fn();
    listParticipants = jest.fn();
    constructor(
      public host: string,
      public apiKey: string,
      public apiSecret: string,
    ) {
      roomClientInstances.push(this as unknown as RoomClientMock);
    }
  }

  class AgentDispatchClient {
    createDispatch = jest.fn();
    constructor(
      public host: string,
      public apiKey: string,
      public apiSecret: string,
    ) {
      dispatchClientInstances.push(this as unknown as DispatchClientMock);
    }
  }

  class SipClient {
    createSipOutboundTrunk = jest.fn();
    listSipOutboundTrunk = jest.fn();
    createSipInboundTrunk = jest.fn();
    createSipDispatchRule = jest.fn();
    deleteSipTrunk = jest.fn();
    deleteSipDispatchRule = jest.fn();
    createSipParticipant = jest.fn();
    updateSipOutboundTrunkFields = jest.fn();
    constructor(
      public host: string,
      public apiKey: string,
      public apiSecret: string,
    ) {
      sipClientInstances.push(this as unknown as SipClientMock);
    }
  }

  class AccessToken {
    addGrant = jest.fn();
    toJwt = jest.fn().mockResolvedValue('jwt-token');
    constructor(...args: unknown[]) {
      accessTokenInstances.push({
        addGrant: this.addGrant,
        toJwt: this.toJwt,
        ctorArgs: args,
      });
    }
  }

  return {
    RoomServiceClient,
    AgentDispatchClient,
    SipClient,
    AccessToken,
  };
});

import { LivekitService } from '../livekit.service';

describe('LivekitService', () => {
  const LIVEKIT_URL = 'wss://test.livekit.cloud';
  const API_KEY = 'key';
  const API_SECRET = 'secret';

  let service: LivekitService;
  let roomClient: RoomClientMock;
  let dispatchClient: DispatchClientMock;
  let sipClient: SipClientMock;

  function makeConfig(
    env: Record<string, string | undefined> = {},
  ): ConfigService {
    const values: Record<string, string | undefined> = {
      LIVEKIT_URL,
      LIVEKIT_API_KEY: API_KEY,
      LIVEKIT_API_SECRET: API_SECRET,
      ...env,
    };
    return {
      getOrThrow: jest.fn((key: string) => {
        const v = values[key];
        if (v === undefined) {
          throw new Error(`missing config ${key}`);
        }
        return v;
      }),
      get: jest.fn((key: string, defaultValue?: string) => {
        if (values[key] !== undefined) {
          return values[key];
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;
  }

  function makeService(env?: Record<string, string | undefined>): LivekitService {
    roomClientInstances.length = 0;
    dispatchClientInstances.length = 0;
    sipClientInstances.length = 0;
    accessTokenInstances.length = 0;
    const svc = new LivekitService(makeConfig(env));
    roomClient = roomClientInstances[roomClientInstances.length - 1];
    dispatchClient = dispatchClientInstances[dispatchClientInstances.length - 1];
    sipClient = sipClientInstances[sipClientInstances.length - 1];
    return svc;
  }

  beforeEach(() => {
    service = makeService();
  });

  describe('config / getters', () => {
    it('1. getUrl returns raw wss URL (not HTTP rewrite)', () => {
      expect(service.getUrl()).toBe(LIVEKIT_URL);
      expect(roomClientInstances[0]).toMatchObject({
        host: 'https://test.livekit.cloud',
        apiKey: API_KEY,
        apiSecret: API_SECRET,
      });
    });

    it('2. getAgentName defaults to call-agent', () => {
      expect(service.getAgentName()).toBe('call-agent');
    });

    it('3. custom LIVEKIT_AGENT_NAME from config', () => {
      service = makeService({ LIVEKIT_AGENT_NAME: 'custom-agent' });
      expect(service.getAgentName()).toBe('custom-agent');
    });
  });

  describe('rooms', () => {
    it('4. createRoom forwards params and returns name', async () => {
      roomClient.createRoom.mockResolvedValue({ name: 'room-1' });

      const result = await service.createRoom({
        name: 'room-1',
        emptyTimeout: 60,
        maxParticipants: 4,
        metadata: '{"a":1}',
      });

      expect(roomClient.createRoom).toHaveBeenCalledWith({
        name: 'room-1',
        emptyTimeout: 60,
        maxParticipants: 4,
        metadata: '{"a":1}',
      });
      expect(result).toEqual({ name: 'room-1' });
    });

    it('5. deleteRoom success calls SDK', async () => {
      roomClient.deleteRoom.mockResolvedValue(undefined);

      await expect(service.deleteRoom('room-x')).resolves.toBeUndefined();
      expect(roomClient.deleteRoom).toHaveBeenCalledWith('room-x');
    });

    it('6. deleteRoom swallows SDK errors', async () => {
      roomClient.deleteRoom.mockRejectedValue(new Error('not found'));

      await expect(service.deleteRoom('gone')).resolves.toBeUndefined();
      expect(roomClient.deleteRoom).toHaveBeenCalledWith('gone');
    });
  });

  describe('hasRemoteCallee', () => {
    it('7. expectedIdentity match is case-insensitive and trims', async () => {
      roomClient.listParticipants.mockResolvedValue([
        { identity: 'agent-abc' },
        { identity: '+15551234567' },
      ]);

      const result = await service.hasRemoteCallee('room-1', {
        expectedIdentity: '  +15551234567  ',
      });

      expect(result).toBe(true);
    });

    it('8. expectedIdentity mismatch with only agent- leaves false', async () => {
      roomClient.listParticipants.mockResolvedValue([
        { identity: 'agent-job-1' },
      ]);

      const result = await service.hasRemoteCallee('room-1', {
        expectedIdentity: '+1999',
      });

      expect(result).toBe(false);
    });

    it('9. no expectedIdentity; non-agent remote present → true', async () => {
      roomClient.listParticipants.mockResolvedValue([
        { identity: 'agent-1' },
        { identity: 'sip-user' },
      ]);

      await expect(service.hasRemoteCallee('room-1')).resolves.toBe(true);
    });

    it('10. only agent-* participants → false', async () => {
      roomClient.listParticipants.mockResolvedValue([
        { identity: 'agent-1' },
        { identity: 'agent-2' },
      ]);

      await expect(service.hasRemoteCallee('room-1')).resolves.toBe(false);
    });

    it('11. empty identity participants ignored → false', async () => {
      roomClient.listParticipants.mockResolvedValue([
        { identity: '' },
        { identity: null },
        { identity: undefined },
      ]);

      await expect(service.hasRemoteCallee('room-1')).resolves.toBe(false);
    });

    it('12. listParticipants throws → false', async () => {
      roomClient.listParticipants.mockRejectedValue(new Error('timeout'));

      await expect(service.hasRemoteCallee('room-1')).resolves.toBe(false);
    });
  });

  describe('agent dispatch', () => {
    it('13. createAgentDispatch uses default agent name', async () => {
      dispatchClient.createDispatch.mockResolvedValue({ id: 'disp-1' });

      const result = await service.createAgentDispatch({
        roomName: 'room-1',
        metadata: '{"callId":"c1"}',
      });

      expect(dispatchClient.createDispatch).toHaveBeenCalledWith(
        'room-1',
        'call-agent',
        { metadata: '{"callId":"c1"}' },
      );
      expect(result).toEqual({
        id: 'disp-1',
        room: 'room-1',
        agentName: 'call-agent',
      });
    });

    it('14. createAgentDispatch override agentName', async () => {
      dispatchClient.createDispatch.mockResolvedValue({ id: 'disp-2' });

      const result = await service.createAgentDispatch({
        roomName: 'room-2',
        metadata: '{}',
        agentName: 'override-agent',
      });

      expect(dispatchClient.createDispatch).toHaveBeenCalledWith(
        'room-2',
        'override-agent',
        { metadata: '{}' },
      );
      expect(result.agentName).toBe('override-agent');
    });
  });

  describe('token / meet url', () => {
    it('15. createParticipantToken default ttl and grant', async () => {
      const token = await service.createParticipantToken({
        identity: 'user-1',
        roomName: 'room-1',
        name: 'Ada',
      });

      expect(token).toBe('jwt-token');
      expect(accessTokenInstances).toHaveLength(1);
      const at = accessTokenInstances[0];
      expect(at.ctorArgs).toEqual([
        API_KEY,
        API_SECRET,
        { identity: 'user-1', name: 'Ada', ttl: '1h' },
      ]);
      expect(at.addGrant).toHaveBeenCalledWith({
        roomJoin: true,
        room: 'room-1',
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      expect(at.toJwt).toHaveBeenCalled();
    });

    it('16. createParticipantToken custom ttl', async () => {
      await service.createParticipantToken({
        identity: 'user-2',
        roomName: 'room-2',
        ttl: '30m',
      });

      expect(accessTokenInstances[0].ctorArgs[2]).toMatchObject({
        identity: 'user-2',
        ttl: '30m',
      });
    });

    it('17. buildMeetUrl encodes liveKitUrl and token', () => {
      const token = 'tok+special/chars=';
      const url = service.buildMeetUrl(token);

      expect(url).toBe(
        `https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(LIVEKIT_URL)}` +
          `&token=${encodeURIComponent(token)}`,
      );
    });
  });

  describe('SIP trunks', () => {
    it('18. createSipOutboundTrunk maps result and uses TCP transport', async () => {
      sipClient.createSipOutboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_out',
        name: 'Out',
        address: 'sip.provider.com',
        numbers: undefined,
      });

      const result = await service.createSipOutboundTrunk({
        name: 'Out',
        address: 'sip.provider.com',
        numbers: ['+1555'],
        authUsername: 'u',
        authPassword: 'p',
        destinationCountry: 'US',
        metadata: 'meta',
      });

      expect(sipClient.createSipOutboundTrunk).toHaveBeenCalledWith(
        'Out',
        'sip.provider.com',
        ['+1555'],
        {
          transport: SIPTransport.SIP_TRANSPORT_TCP,
          authUsername: 'u',
          authPassword: 'p',
          destinationCountry: 'US',
          metadata: 'meta',
        },
      );
      expect(result).toEqual({
        sipTrunkId: 'ST_out',
        name: 'Out',
        address: 'sip.provider.com',
        numbers: [],
      });
    });

    it('18b. updateSipOutboundTrunkFields forwards destinationCountry', async () => {
      sipClient.updateSipOutboundTrunkFields.mockResolvedValue({
        sipTrunkId: 'ST_out',
        destinationCountry: 'in',
      });

      await service.updateSipOutboundTrunkFields('ST_out', {
        destinationCountry: 'in',
      });

      expect(sipClient.updateSipOutboundTrunkFields).toHaveBeenCalledWith(
        'ST_out',
        { destinationCountry: 'in' },
      );
    });

    it('19. listSipOutboundTrunks maps numbers default []', async () => {
      sipClient.listSipOutboundTrunk.mockResolvedValue([
        {
          sipTrunkId: 'ST_1',
          name: 'A',
          address: 'a.com',
          numbers: ['+1'],
        },
        {
          sipTrunkId: 'ST_2',
          name: 'B',
          address: 'b.com',
          numbers: undefined,
        },
      ]);

      const result = await service.listSipOutboundTrunks();

      expect(result).toEqual([
        {
          sipTrunkId: 'ST_1',
          name: 'A',
          address: 'a.com',
          numbers: ['+1'],
        },
        {
          sipTrunkId: 'ST_2',
          name: 'B',
          address: 'b.com',
          numbers: [],
        },
      ]);
    });

    it('20. createSipInboundTrunk empty allowed lists → undefined opts', async () => {
      sipClient.createSipInboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_in',
        name: 'In',
        numbers: ['+1555'],
      });

      await service.createSipInboundTrunk({
        name: 'In',
        numbers: ['+1555'],
        allowedNumbers: [],
        allowedAddresses: [],
      });

      expect(sipClient.createSipInboundTrunk).toHaveBeenCalledWith(
        'In',
        ['+1555'],
        expect.objectContaining({
          allowedNumbers: undefined,
          allowedAddresses: undefined,
        }),
      );
    });

    it('21. createSipInboundTrunk with allowed lists passes through', async () => {
      sipClient.createSipInboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_in2',
        name: 'In2',
        numbers: ['+1555'],
      });

      const result = await service.createSipInboundTrunk({
        name: 'In2',
        numbers: ['+1555'],
        allowedNumbers: ['+1999'],
        allowedAddresses: ['1.2.3.4'],
        authUsername: 'u',
        authPassword: 'p',
        krispEnabled: false,
        metadata: 'm',
      });

      expect(sipClient.createSipInboundTrunk).toHaveBeenCalledWith(
        'In2',
        ['+1555'],
        {
          metadata: 'm',
          allowedNumbers: ['+1999'],
          allowedAddresses: ['1.2.3.4'],
          authUsername: 'u',
          authPassword: 'p',
          krispEnabled: false,
        },
      );
      expect(result).toEqual({
        sipTrunkId: 'ST_in2',
        name: 'In2',
        numbers: ['+1555'],
      });
    });
  });

  describe('SIP dispatch rules', () => {
    beforeEach(() => {
      sipClient.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_1',
        name: 'Rule',
      });
    });

    it('22. individual rule mapping', async () => {
      await service.createSipDispatchRule({
        name: 'Rule',
        rule: { type: 'individual', roomPrefix: 'call-', pin: '12' },
        trunkIds: ['ST_1'],
      });

      expect(sipClient.createSipDispatchRule).toHaveBeenCalledWith(
        {
          type: 'individual',
          roomPrefix: 'call-',
          pin: '12',
        },
        expect.objectContaining({
          name: 'Rule',
          trunkIds: ['ST_1'],
        }),
      );
    });

    it('23. direct rule mapping', async () => {
      await service.createSipDispatchRule({
        name: 'Direct',
        rule: { type: 'direct', roomName: 'fixed-room', pin: '9' },
      });

      expect(sipClient.createSipDispatchRule).toHaveBeenCalledWith(
        {
          type: 'direct',
          roomName: 'fixed-room',
          pin: '9',
        },
        expect.objectContaining({ name: 'Direct' }),
      );
    });

    it('24. callee rule without roomPrefix defaults to empty string', async () => {
      await service.createSipDispatchRule({
        name: 'Callee',
        rule: { type: 'callee', randomize: true },
      });

      expect(sipClient.createSipDispatchRule).toHaveBeenCalledWith(
        {
          type: 'callee',
          roomPrefix: '',
          pin: undefined,
          randomize: true,
        },
        expect.objectContaining({ name: 'Callee' }),
      );
    });

    it('25. agentName sets roomConfig agents with default empty metadata', async () => {
      await service.createSipDispatchRule({
        name: 'WithAgent',
        rule: { type: 'individual', roomPrefix: 'call-' },
        agentName: 'call-agent',
      });

      const opts = sipClient.createSipDispatchRule.mock.calls[0][1];
      expect(opts.roomConfig).toBeDefined();
      expect(opts.roomConfig.agents).toHaveLength(1);
      expect(opts.roomConfig.agents[0].agentName).toBe('call-agent');
      expect(opts.roomConfig.agents[0].metadata).toBe('');
    });

    it('26. blank agentName (whitespace) does not set roomConfig', async () => {
      await service.createSipDispatchRule({
        name: 'NoAgent',
        rule: { type: 'individual', roomPrefix: 'call-' },
        agentName: '   ',
        agentMetadata: '{"x":1}',
      });

      const opts = sipClient.createSipDispatchRule.mock.calls[0][1];
      expect(opts.roomConfig).toBeUndefined();
    });

    it('27. returns sipDispatchRuleId and name; agentMetadata passed when set', async () => {
      const result = await service.createSipDispatchRule({
        name: 'Rule',
        rule: { type: 'individual', roomPrefix: 'call-' },
        agentName: 'call-agent',
        agentMetadata: '{"callId":"c1"}',
        hidePhoneNumber: true,
        attributes: { k: 'v' },
        metadata: 'meta',
      });

      expect(result).toEqual({
        sipDispatchRuleId: 'SDR_1',
        name: 'Rule',
      });
      const opts = sipClient.createSipDispatchRule.mock.calls[0][1];
      expect(opts.hidePhoneNumber).toBe(true);
      expect(opts.attributes).toEqual({ k: 'v' });
      expect(opts.metadata).toBe('meta');
      expect(opts.roomConfig.agents[0].metadata).toBe('{"callId":"c1"}');
    });
  });

  describe('deletes + SIP participant', () => {
    it('28. deleteSipTrunk forwards id', async () => {
      sipClient.deleteSipTrunk.mockResolvedValue(undefined);

      await service.deleteSipTrunk('ST_del');

      expect(sipClient.deleteSipTrunk).toHaveBeenCalledWith('ST_del');
    });

    it('29. deleteSipDispatchRule forwards id', async () => {
      sipClient.deleteSipDispatchRule.mockResolvedValue(undefined);

      await service.deleteSipDispatchRule('SDR_del');

      expect(sipClient.deleteSipDispatchRule).toHaveBeenCalledWith('SDR_del');
    });

    it('30. createSipParticipant defaults identity/name and waitUntilAnswered', async () => {
      sipClient.createSipParticipant.mockResolvedValue({
        participantId: 'p1',
        participantIdentity: '+1555',
        roomName: 'room-1',
        sipCallId: 'SCL_1',
      });

      const result = await service.createSipParticipant({
        sipTrunkId: 'ST_1',
        phoneNumber: '+1555',
        roomName: 'room-1',
      });

      expect(sipClient.createSipParticipant).toHaveBeenCalledWith(
        'ST_1',
        '+1555',
        'room-1',
        expect.objectContaining({
          fromNumber: undefined,
          participantIdentity: '+1555',
          participantName: '+1555',
          waitUntilAnswered: false,
          playDialtone: undefined,
          krispEnabled: undefined,
          ringingTimeout: undefined,
          timeout: undefined,
        }),
      );
      expect(sipClient.createSipParticipant.mock.calls[0][3].media).toBeUndefined();
      expect(result).toEqual({
        participantId: 'p1',
        participantIdentity: '+1555',
        roomName: 'room-1',
        sipCallId: 'SCL_1',
      });
    });

    it('31. createSipParticipant forwards explicit opts', async () => {
      sipClient.createSipParticipant.mockResolvedValue({
        participantId: 'p2',
        participantIdentity: 'id-custom',
        roomName: 'room-2',
        sipCallId: 'SCL_2',
      });

      const result = await service.createSipParticipant({
        sipTrunkId: 'ST_2',
        phoneNumber: '+1999',
        roomName: 'room-2',
        fromNumber: '+1800',
        participantIdentity: 'id-custom',
        participantName: 'Callee',
        waitUntilAnswered: true,
        playDialtone: true,
        krispEnabled: false,
        ringingTimeout: 45,
        timeout: 60,
      });

      expect(sipClient.createSipParticipant).toHaveBeenCalledWith(
        'ST_2',
        '+1999',
        'room-2',
        expect.objectContaining({
          fromNumber: '+1800',
          participantIdentity: 'id-custom',
          participantName: 'Callee',
          waitUntilAnswered: true,
          playDialtone: true,
          krispEnabled: false,
          ringingTimeout: 45,
          timeout: 60,
          media: expect.objectContaining({
            mediaTimeout: expect.objectContaining({ seconds: 90n }),
          }),
        }),
      );
      expect(result.sipCallId).toBe('SCL_2');
    });
  });
});
