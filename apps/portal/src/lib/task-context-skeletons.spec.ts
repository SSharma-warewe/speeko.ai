import type { VoiceTaskDefinition } from "@call-agent/contracts";
import {
  callContextTaskSelection,
  formatTaskContextSkeleton,
  getTaskContextSkeleton,
} from "./task-context-skeletons";

const clinicTask: VoiceTaskDefinition = {
  name: "Clinic appointment confirmation",
  description: "",
  directions: ["outbound"],
  objective: "Confirm the appointment",
  phases: [],
  contextFields: ["firstName", "location", "time", "notes"].map((key) => ({
    key,
    description: key,
    type: "string",
  })),
  resultFields: [],
  outcomes: [],
  toolIds: [],
};

describe("saved voice task context templates", () => {
  it("uses the clinic's published fields instead of the generic legacy example", () => {
    expect(
      JSON.parse(formatTaskContextSkeleton("voice:clinic", clinicTask)),
    ).toEqual({
      firstName: "",
      location: "",
      time: "",
      notes: "",
    });
  });

  it("preserves defaults including empty strings, zero and false", () => {
    const definition: VoiceTaskDefinition = {
      ...clinicTask,
      contextFields: [
        {
          key: "location",
          type: "string",
          description: "",
          defaultValue: "Main clinic",
        },
        { key: "notes", type: "string", description: "", defaultValue: "" },
        { key: "duration", type: "number", description: "", defaultValue: 30 },
        { key: "attempts", type: "number", description: "", defaultValue: 0 },
        {
          key: "confirmed",
          type: "boolean",
          description: "",
          defaultValue: false,
        },
        {
          key: "priority",
          type: "enum",
          description: "",
          enumValues: ["normal", "urgent"],
          defaultValue: "urgent",
        },
      ],
    };
    expect(getTaskContextSkeleton("voice:clinic", definition)).toEqual({
      location: "Main clinic",
      notes: "",
      duration: 30,
      attempts: 0,
      confirmed: false,
      priority: "urgent",
    });
  });

  it("uses correctly typed placeholders and leaves the destination phone number to the form", () => {
    const definition: VoiceTaskDefinition = {
      ...clinicTask,
      contextFields: [
        { key: "duration", type: "number", description: "" },
        { key: "confirmed", type: "boolean", description: "" },
        {
          key: "priority",
          type: "enum",
          description: "",
          enumValues: ["normal", "urgent"],
        },
        { key: "phoneNumber", type: "string", description: "" },
      ],
    };
    expect(getTaskContextSkeleton("voice:clinic", definition)).toEqual({
      duration: 0,
      confirmed: false,
      priority: "normal",
    });
  });

  it("keeps input-free and unavailable saved tasks free of legacy fields", () => {
    expect(
      getTaskContextSkeleton("voice:clinic", {
        ...clinicTask,
        contextFields: [],
      }),
    ).toEqual({});
    expect(getTaskContextSkeleton("voice:missing")).toEqual({});
  });

  it("preserves legacy examples", () => {
    expect(getTaskContextSkeleton("interview_booking")).toEqual({
      customerName: "",
      email: "",
      durationMinutes: 30,
      notes: "",
    });
    expect(getTaskContextSkeleton(null)).toEqual({
      customerName: "",
      notes: "",
    });
  });
});

describe("call context default previews", () => {
  const agent = { defaultVoiceTaskId: "clinic", defaultTaskKey: null };
  const template = {
    defaultVoiceTaskId: "platform",
    defaultTaskKey: "general",
  };

  it("previews an explicit selection ahead of agent and platform defaults", () => {
    expect(callContextTaskSelection("voice:other", agent, template)).toBe(
      "voice:other",
    );
    expect(callContextTaskSelection("demo_booking", agent, template)).toBe(
      "demo_booking",
    );
  });

  it("previews a saved org task without converting Agent default into an override", () => {
    expect(callContextTaskSelection("", agent, template)).toBe("voice:clinic");
  });

  it("inherits a platform saved task when the org has no default", () => {
    expect(
      callContextTaskSelection(
        "",
        { defaultVoiceTaskId: null, defaultTaskKey: null },
        template,
      ),
    ).toBe("voice:platform");
  });

  it("gives a saved legacy org task precedence over a platform configured task", () => {
    expect(
      callContextTaskSelection(
        "",
        { defaultVoiceTaskId: null, defaultTaskKey: "demo_booking" },
        template,
      ),
    ).toBe("demo_booking");
  });

  it("uses the platform legacy task, then general when no default exists", () => {
    expect(
      callContextTaskSelection("", undefined, {
        defaultVoiceTaskId: null,
        defaultTaskKey: "interview_booking",
      }),
    ).toBe("interview_booking");
    expect(callContextTaskSelection("")).toBe("general");
  });
});
