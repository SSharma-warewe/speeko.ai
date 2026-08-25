import { NotFoundException } from '@nestjs/common';
import { ParseResourceIdPipe } from '../parse-resource-id.pipe';

const meta = { type: 'param' as const, data: 'id', metatype: String };

describe('ParseResourceIdPipe', () => {
  const pipe = ParseResourceIdPipe('Call');

  it('throws NotFoundException for a non-uuid path id', async () => {
    await expect(pipe.transform('not-a-real-id', meta)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(pipe.transform('not-a-real-id', meta)).rejects.toMatchObject({
      message: 'Call not found',
    });
  });

  it('accepts a valid uuid', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(pipe.transform(id, meta)).resolves.toBe(id);
  });
});
