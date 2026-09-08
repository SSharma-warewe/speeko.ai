import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  DEMO_PERSON_NAME_MESSAGE,
  DEMO_WORK_EMAIL_MESSAGE,
  isDemoEmailShape,
  isDemoFullName,
  isDemoPersonName,
  isDemoWorkEmail,
} from '@call-agent/contracts';
import { RequestDemoDto } from '../dto/request-demo.dto';

describe('demo lead quality', () => {
  describe('isDemoPersonName', () => {
    it.each([
      'Alex',
      'José',
      "O'Brien",
      'Mary-Jane',
      'Ng',
      'St. John',
      'François',
    ])('accepts %s', (name) => {
      expect(isDemoPersonName(name)).toBe(true);
    });

    it.each([
      'test',
      'Tést',
      'TEST',
      'testing',
      'asdf',
      'a',
      '123',
      'xxx',
      'user',
      'n/a',
      'foo',
      'John2',
    ])('rejects %s', (name) => {
      expect(isDemoPersonName(name)).toBe(false);
    });
  });

  describe('isDemoFullName', () => {
    it('accepts a real given + family name', () => {
      expect(isDemoFullName('Alex', 'Morgan')).toBe(true);
    });

    it('rejects John Doe and Jane Doe', () => {
      expect(isDemoFullName('John', 'Doe')).toBe(false);
      expect(isDemoFullName('Jane', 'Doe')).toBe(false);
    });

    it('rejects when either part is a placeholder', () => {
      expect(isDemoFullName('test', 'test')).toBe(false);
      expect(isDemoFullName('Alex', 'test')).toBe(false);
    });
  });

  describe('isDemoWorkEmail', () => {
    it.each(['alex@acme.health', 'alex@acme.co.uk', 'ops@speeko.ai'])(
      'accepts %s',
      (email) => {
        expect(isDemoEmailShape(email)).toBe(true);
        expect(isDemoWorkEmail(email)).toBe(true);
      },
    );

    it.each([
      'test@example.com',
      'a@gmail.com',
      'a@googlemail.com',
      'a@yahoo.co.uk',
      'a@outlook.com',
      'a@mailinator.com',
      'a@foo.test',
      'lead@example.org',
    ])('rejects %s', (email) => {
      expect(isDemoWorkEmail(email)).toBe(false);
    });

    it('still allows test@ on a company domain', () => {
      expect(isDemoWorkEmail('test@acme.health')).toBe(true);
    });

    it('rejects a malformed address', () => {
      expect(isDemoEmailShape('not-an-email')).toBe(false);
      expect(isDemoWorkEmail('not-an-email')).toBe(false);
    });
  });
});

describe('RequestDemoDto lead quality', () => {
  const valid = {
    firstName: 'Alex',
    lastName: 'Morgan',
    company: 'Acme Health',
    email: 'alex@acme.health',
    phone: '+15550102000',
    country: 'United States',
    teamSize: '11–50',
    callsPerDay: '50–200',
    direction: 'outbound',
    integrations: ['HubSpot'],
  };

  function messagesFor(errors: ValidationError[], property: string): string[] {
    const err = errors.find((e) => e.property === property);
    return err ? Object.values(err.constraints ?? {}) : [];
  }

  it('accepts a real name and work email', async () => {
    const dto = plainToInstance(RequestDemoDto, valid);
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects test / test / test@example.com', async () => {
    const dto = plainToInstance(RequestDemoDto, {
      ...valid,
      firstName: 'test',
      lastName: 'test',
      email: 'test@example.com',
    });
    const errors = await validate(dto);
    expect(messagesFor(errors, 'firstName')).toContain(
      DEMO_PERSON_NAME_MESSAGE,
    );
    expect(messagesFor(errors, 'lastName')).toContain(DEMO_PERSON_NAME_MESSAGE);
    expect(messagesFor(errors, 'email')).toContain(DEMO_WORK_EMAIL_MESSAGE);
  });

  it('rejects John Doe even when each name is otherwise valid', async () => {
    const dto = plainToInstance(RequestDemoDto, {
      ...valid,
      firstName: 'John',
      lastName: 'Doe',
    });
    const errors = await validate(dto);
    expect(messagesFor(errors, 'lastName')).toContain(DEMO_PERSON_NAME_MESSAGE);
    expect(messagesFor(errors, 'firstName')).toEqual([]);
  });

  it('does not flag a real last name when only the first name is junk', async () => {
    const dto = plainToInstance(RequestDemoDto, {
      ...valid,
      firstName: 'test',
    });
    const errors = await validate(dto);
    expect(messagesFor(errors, 'firstName')).toContain(
      DEMO_PERSON_NAME_MESSAGE,
    );
    expect(messagesFor(errors, 'lastName')).toEqual([]);
  });

  it('rejects a Gmail address', async () => {
    const dto = plainToInstance(RequestDemoDto, {
      ...valid,
      email: 'alex@gmail.com',
    });
    const errors = await validate(dto);
    expect(messagesFor(errors, 'email')).toContain(DEMO_WORK_EMAIL_MESSAGE);
  });
});
