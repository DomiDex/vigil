import { describe, test, expect } from "bun:test";
import {
  specialistFormSchema,
  TRIGGER_EVENT_OPTIONS,
  type SpecialistFormData,
} from "../../plugins/agents/specialist-form-schema";

describe("specialistFormSchema", () => {
  const validForm: SpecialistFormData = {
    name: "my-agent",
    class: "analytical",
    description: "A test specialist agent",
    triggerEvents: ["new_commit"],
  };

  test("accepts valid form with required fields only", () => {
    const result = specialistFormSchema.parse(validForm);
    expect(result.name).toBe("my-agent");
    expect(result.class).toBe("analytical");
  });

  test("accepts valid form with all optional fields", () => {
    const result = specialistFormSchema.parse({
      ...validForm,
      model: "sonnet",
      watchPatterns: ["*.ts", "*.tsx"],
      systemPrompt: "You are a security auditor.",
      cooldownSeconds: 600,
      severityThreshold: "warning",
    });
    expect(result.model).toBe("sonnet");
    expect(result.cooldownSeconds).toBe(600);
  });

  test("rejects name with uppercase letters", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, name: "MyAgent" }),
    ).toThrow();
  });

  test("rejects name with spaces", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, name: "my agent" }),
    ).toThrow();
  });

  test("rejects name with special characters", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, name: "my_agent!" }),
    ).toThrow();
  });

  test("accepts name with hyphens and numbers", () => {
    const result = specialistFormSchema.parse({
      ...validForm,
      name: "code-review-2",
    });
    expect(result.name).toBe("code-review-2");
  });

  test("rejects empty name", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, name: "" }),
    ).toThrow();
  });

  test("rejects empty description", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, description: "" }),
    ).toThrow();
  });

  test("rejects invalid class value", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, class: "heuristic" }),
    ).toThrow();
  });

  test("accepts both class values", () => {
    for (const cls of ["deterministic", "analytical"] as const) {
      const result = specialistFormSchema.parse({ ...validForm, class: cls });
      expect(result.class).toBe(cls);
    }
  });

  test("rejects empty triggerEvents array", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, triggerEvents: [] }),
    ).toThrow();
  });

  test("rejects invalid severityThreshold value", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, severityThreshold: "extreme" }),
    ).toThrow();
  });

  test("accepts all valid severityThreshold values", () => {
    for (const sev of ["info", "warning", "critical"] as const) {
      const result = specialistFormSchema.parse({
        ...validForm,
        severityThreshold: sev,
      });
      expect(result.severityThreshold).toBe(sev);
    }
  });

  test("rejects negative cooldownSeconds", () => {
    expect(() =>
      specialistFormSchema.parse({ ...validForm, cooldownSeconds: -1 }),
    ).toThrow();
  });

  test("TRIGGER_EVENT_OPTIONS contains expected values", () => {
    expect(TRIGGER_EVENT_OPTIONS).toContain("new_commit");
    expect(TRIGGER_EVENT_OPTIONS).toContain("file_change");
    expect(TRIGGER_EVENT_OPTIONS).toContain("action_executed");
    expect(TRIGGER_EVENT_OPTIONS).toHaveLength(3);
  });
});
