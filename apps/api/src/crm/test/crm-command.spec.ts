import { ValidationPipe } from '@nestjs/common';
import { CrmCommandDto } from '../dto/crm-command.dto';

describe('CRM commands through the production validation pipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  it.each([
    { action: 'contacts.list', params: { query: 'Ada', limit: 50 } },
    {
      action: 'contacts.create',
      params: { data: { firstName: 'Ada', email: 'ada@example.com' } },
    },
    {
      action: 'contacts.update',
      params: { id: 'contact1', data: { firstName: 'Ada' } },
    },
    {
      action: 'notes.create',
      params: { contactId: 'contact1', data: { body: 'Follow up' } },
    },
    {
      action: 'events.update',
      params: { id: 'event1', data: { appointmentStatus: 'confirmed' } },
    },
  ])('preserves action-specific parameters for $action', async (command) => {
    const parsed = await pipe.transform(command, {
      type: 'body',
      metatype: CrmCommandDto,
    });
    expect(parsed).toEqual(command);
  });
});
