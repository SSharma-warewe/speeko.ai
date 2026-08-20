import { createConfirmAppointmentTask } from './confirm-appointment.task.js';
import { createCustomerSupportTask } from './customer-support.task.js';
import { createDebtCollectionTask } from './debt-collection.task.js';
import { createDemoBookingTask } from './demo-booking.task.js';
import { createGeneralConversationTask } from './general-conversation.task.js';
import { createInterviewBookingTask } from './interview-booking.task.js';
import { createLeadQualificationTask } from './lead-qualification.task.js';
import { createSurveyTask } from './survey.task.js';
import { TASK_KEYS } from './task-ids.js';
import type { TaskFactory, TaskFactoryContext } from './types.js';
import type { voice } from '@livekit/agents';

const factories = new Map<string, TaskFactory>([
  [TASK_KEYS.general, createGeneralConversationTask],
  [TASK_KEYS.confirmAppointment, createConfirmAppointmentTask],
  [TASK_KEYS.leadQualification, createLeadQualificationTask],
  [TASK_KEYS.customerSupport, createCustomerSupportTask],
  [TASK_KEYS.survey, createSurveyTask],
  [TASK_KEYS.debtCollection, createDebtCollectionTask],
  [TASK_KEYS.demoBooking, createDemoBookingTask],
  [TASK_KEYS.interviewBooking, createInterviewBookingTask],
]);

export class TaskRegistry {
  static has(key: string): boolean {
    return factories.has(key);
  }

  static listKeys(): string[] {
    return [...factories.keys()].sort();
  }

  static create(ctx: TaskFactoryContext): voice.AgentTask<Record<string, unknown>> {
    const key = (ctx.meta.task || TASK_KEYS.general).trim();
    const factory = factories.get(key) ?? factories.get(TASK_KEYS.general)!;
    if (!factories.has(key)) {
      console.warn(
        `[TaskRegistry] unknown task key "${key}", falling back to general`,
      );
    }
    return factory(ctx);
  }
}
