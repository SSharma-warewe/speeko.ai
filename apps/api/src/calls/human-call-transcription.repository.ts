import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Call } from './call.entity';
import { HumanCallSession } from './human-call-session.entity';

@Injectable()
export class HumanCallTranscriptionRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Same call-first lock order as the supervisor; also allows final writes after finished_at. */
  mutate<T>(
    callId: string,
    action: (call: Call, session: HumanCallSession) => Promise<T> | T,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      const call = await manager.findOne(Call, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      const session = await manager.findOneBy(HumanCallSession, { callId });
      if (!call || call.executionType !== 'human' || !session)
        throw new NotFoundException('Human call not found');
      call.humanSession = session;
      const result = await action(call, session);
      // Only transcription-owned fields, never session/workspace or lifecycle writes.
      const json = (value: unknown) =>
        value == null ? null : JSON.stringify(value);
      await manager.query(
        `UPDATE calls SET transcript = $2::jsonb, session_report = $3::jsonb,
        usage = $4::jsonb, cost = $5::jsonb, cost_usd = $6, updated_at = NOW() WHERE id = $1`,
        [
          call.id,
          json(call.transcript),
          json(call.sessionReport),
          json(call.usage),
          json(call.cost),
          call.costUsd,
        ],
      );
      return result;
    });
  }

  due(): Promise<Array<{ id: string }>> {
    return this.db.query(`SELECT id FROM calls WHERE execution_type = 'human'
      AND session_report->'transcription'->>'status' IN ('pending','running','finalizing')
      AND ((session_report->'transcription'->>'heartbeatAt')::timestamptz < NOW() - INTERVAL '30 seconds'
        OR ended_at < NOW() - INTERVAL '30 seconds') LIMIT 100`);
  }
}
