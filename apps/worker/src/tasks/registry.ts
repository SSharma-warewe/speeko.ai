import { createDemoBookingTask } from './demo-booking.task.js';
import { createConfigurableTask } from './configurable.task.js';
import { createGeneralConversationTask } from './general-conversation.task.js';
import { createInterviewBookingTask } from './interview-booking.task.js';
import { createLoanCollectionTask } from './loan-collection.task.js';
import { createPersonalLoanOutreachTask } from './personal-loan-outreach.task.js';
import { createRealEstateOutreachTask } from './real-estate-outreach.task.js';
import { createRealEstateVisitConfirmationTask } from './real-estate-visit-confirmation.task.js';
import { TASK_KEYS } from './task-ids.js';
import type { TaskFactory, TaskFactoryContext } from './types.js';
import type { voice } from '@livekit/agents';

const factories = new Map<string, TaskFactory>([
  [TASK_KEYS.general, createGeneralConversationTask],
  [TASK_KEYS.demoBooking, createDemoBookingTask],
  [TASK_KEYS.interviewBooking, createInterviewBookingTask],
  [TASK_KEYS.personalLoanOutreach, createPersonalLoanOutreachTask],
  [TASK_KEYS.loanCollection, createLoanCollectionTask],
  [TASK_KEYS.realEstateOutreach, createRealEstateOutreachTask],
  [TASK_KEYS.realEstateVisitConfirmation, createRealEstateVisitConfirmationTask],
]);

export class TaskRegistry {
  static has(key: string): boolean {
    return factories.has(key);
  }

  static listKeys(): string[] {
    return [...factories.keys()].sort();
  }

  static create(ctx: TaskFactoryContext): voice.AgentTask<Record<string, unknown>> {
    if (ctx.meta.voiceTask != null) return createConfigurableTask(ctx);
    const key = (ctx.meta.task || TASK_KEYS.general).trim();
    if (key.startsWith('custom_')) throw new Error('Configured task is missing its definition snapshot');
    const factory = factories.get(key) ?? factories.get(TASK_KEYS.general)!;
    if (!factories.has(key)) {
      console.warn(
        `[TaskRegistry] unknown task key "${key}", falling back to general`,
      );
    }
    return factory(ctx);
  }
}
