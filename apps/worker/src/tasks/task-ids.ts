/** Stable task keys shared with API metadata.task / organization_agents.default_task_key. */
export const TASK_KEYS = {
  general: 'general',
  confirmAppointment: 'confirm_appointment',
  leadQualification: 'lead_qualification',
  customerSupport: 'customer_support',
  survey: 'survey',
  debtCollection: 'debt_collection',
  /** Schedule a demo (calendar), then short product discovery questions. */
  demoBooking: 'demo_booking',
  /** Confirm callee name, then book an interview with whatever calendar tools are enabled. */
  interviewBooking: 'interview_booking',
} as const;

export type TaskKey = (typeof TASK_KEYS)[keyof typeof TASK_KEYS];
