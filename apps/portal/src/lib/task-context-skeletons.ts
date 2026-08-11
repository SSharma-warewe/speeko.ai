/**
 * Per-task runtime context skeletons for Dial now (and similar forms).
 * Keys match what worker tasks read via contextField / instructions.
 * phoneNumber is supplied separately from the dial form.
 */

export const TASK_CONTEXT_SKELETONS: Record<string, Record<string, unknown>> = {
  general: {
    customerName: "",
    notes: "",
  },
  confirm_appointment: {
    bookingId: "",
    patientName: "",
    appointmentTime: "",
  },
  lead_qualification: {
    customerName: "",
    company: "",
    product: "",
    source: "",
  },
  customer_support: {
    customerName: "",
    ticketId: "",
    issueSummary: "",
  },
  survey: {
    surveyId: "",
    questions: ["Question 1?", "Question 2?"],
  },
  debt_collection: {
    customerName: "",
    accountId: "",
    amount: "",
  },
  demo_booking: {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    notes: "",
  },
};

export function getTaskContextSkeleton(
  taskKey: string | null | undefined,
): Record<string, unknown> {
  const key = (taskKey || "").trim();
  if (key && TASK_CONTEXT_SKELETONS[key]) {
    return structuredClone(TASK_CONTEXT_SKELETONS[key]);
  }
  return structuredClone(TASK_CONTEXT_SKELETONS.general);
}

export function formatTaskContextSkeleton(
  taskKey: string | null | undefined,
): string {
  return JSON.stringify(getTaskContextSkeleton(taskKey), null, 2);
}
