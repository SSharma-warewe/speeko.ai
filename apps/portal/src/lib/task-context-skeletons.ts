import type { Agent, VoiceTaskDefinition } from "@call-agent/contracts";

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
  demo_booking: {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    notes: "",
  },
  interview_booking: {
    customerName: "",
    email: "",
    durationMinutes: 30,
    notes: "",
  },
  personal_loan_outreach: {
    name: "",
    email: "",
    loanAmount: "",
    interestRate: "",
    time: "",
  },
  loan_collection: {
    name: "",
    email: "",
    dueType: "",
    dueDate: "",
    loanAmount: "",
  },
  real_estate_outreach: {
    name: "",
    email: "",
    location: "",
    budget: "",
  },
  real_estate_visit_confirmation: {
    name: "",
    location: "",
    time: "",
    notes: "",
  },
};

export function getTaskContextSkeleton(
  taskKey: string | null | undefined,
  definition?: VoiceTaskDefinition,
): Record<string, unknown> {
  if (definition) {
    return Object.fromEntries(
      definition.contextFields
        .filter((field) => field.key !== "phoneNumber")
        .map((field) => [
          field.key,
          field.defaultValue ??
            (field.type === "number"
              ? 0
              : field.type === "boolean"
                ? false
                : field.type === "enum"
                  ? (field.enumValues?.[0] ?? "")
                  : ""),
        ]),
    );
  }
  const key = (taskKey || "").trim();
  // A saved task must never fall back to unrelated legacy input fields.
  if (key.startsWith("voice:")) return {};
  if (key && TASK_CONTEXT_SKELETONS[key]) {
    return structuredClone(TASK_CONTEXT_SKELETONS[key]);
  }
  return structuredClone(TASK_CONTEXT_SKELETONS.general);
}

export function formatTaskContextSkeleton(
  taskKey: string | null | undefined,
  definition?: VoiceTaskDefinition,
): string {
  return JSON.stringify(getTaskContextSkeleton(taskKey, definition), null, 2);
}

/** Preview only: keep the request selector empty so the API resolves defaults. */
export function callContextTaskSelection(
  requested: string,
  agent?: Pick<Agent, "defaultVoiceTaskId" | "defaultTaskKey">,
  template?: Pick<Agent, "defaultVoiceTaskId" | "defaultTaskKey">,
): string {
  if (requested) return requested;
  if (agent?.defaultVoiceTaskId) return `voice:${agent.defaultVoiceTaskId}`;
  if (agent?.defaultTaskKey) return agent.defaultTaskKey;
  if (template?.defaultVoiceTaskId)
    return `voice:${template.defaultVoiceTaskId}`;
  return template?.defaultTaskKey || "general";
}
