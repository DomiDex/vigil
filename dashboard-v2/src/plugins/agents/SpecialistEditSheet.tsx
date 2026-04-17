import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import {
  createSpecialist,
  deleteSpecialist,
  getSpecialistDetail,
  updateSpecialist,
} from "../../server/functions";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import type {
  FindingSeverity,
  SpecialistClass,
  SpecialistDetailResponse,
} from "../../types/api";
import {
  TRIGGER_EVENT_OPTIONS,
  specialistFormSchema,
  type SpecialistFormData,
} from "./specialist-form-schema";

interface SpecialistEditSheetProps {
  name?: string;
  open: boolean;
  onClose: () => void;
}

interface FormState {
  name: string;
  class: SpecialistClass;
  description: string;
  model: string;
  triggerEvents: string[];
  watchPatterns: string;
  systemPrompt: string;
  cooldownSeconds: string;
  severityThreshold: FindingSeverity | "";
}

const EMPTY_FORM: FormState = {
  name: "",
  class: "analytical",
  description: "",
  model: "",
  triggerEvents: [],
  watchPatterns: "",
  systemPrompt: "",
  cooldownSeconds: "",
  severityThreshold: "",
};

export function SpecialistEditSheet({
  name,
  open,
  onClose,
}: SpecialistEditSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = !!name;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: vigilKeys.specialists.detail(name ?? ""),
    queryFn: () => getSpecialistDetail({ data: { name: name! } }),
    enabled: isEdit && open,
  });
  const detail = detailData as SpecialistDetailResponse | undefined;

  useEffect(() => {
    if (!open) return;
    if (isEdit && detail) {
      const c = detail.config;
      setForm({
        name: c.name,
        class: c.class,
        description: c.description,
        model: c.model ?? "",
        triggerEvents: c.triggerEvents,
        watchPatterns: (c.watchPatterns ?? []).join("\n"),
        systemPrompt: c.systemPrompt ?? "",
        cooldownSeconds:
          c.cooldownSeconds !== undefined ? String(c.cooldownSeconds) : "",
        severityThreshold: c.severityThreshold ?? "",
      });
      setErrors({});
    } else if (!isEdit) {
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open, isEdit, detail]);

  const createMut = useMutation({
    mutationFn: (payload: SpecialistFormData) =>
      createSpecialist({
        data: {
          name: payload.name,
          class: payload.class,
          description: payload.description,
          model: payload.model,
          triggerEvents: payload.triggerEvents,
          watchPatterns: payload.watchPatterns,
          systemPrompt: payload.systemPrompt,
          cooldownSeconds: payload.cooldownSeconds,
          severityThreshold: payload.severityThreshold,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      toast.success("Specialist created");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: SpecialistFormData) =>
      updateSpecialist({
        data: {
          name: payload.name,
          description: payload.description,
          model: payload.model,
          triggerEvents: payload.triggerEvents,
          watchPatterns: payload.watchPatterns,
          systemPrompt: payload.systemPrompt,
          cooldownSeconds: payload.cooldownSeconds,
          severityThreshold: payload.severityThreshold,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      if (name) {
        queryClient.invalidateQueries({
          queryKey: vigilKeys.specialists.detail(name),
        });
      }
      toast.success("Specialist updated");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSpecialist({ data: { name: name! } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      toast.success("Specialist deleted");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  const payload: SpecialistFormData | null = useMemo(() => {
    const watchPatterns = form.watchPatterns
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const cooldownSeconds = form.cooldownSeconds.trim()
      ? Number(form.cooldownSeconds)
      : undefined;
    const severityThreshold =
      form.severityThreshold !== "" ? form.severityThreshold : undefined;

    const candidate = {
      name: form.name.trim(),
      class: form.class,
      description: form.description.trim(),
      model: form.model.trim() || undefined,
      triggerEvents: form.triggerEvents,
      watchPatterns: watchPatterns.length > 0 ? watchPatterns : undefined,
      systemPrompt: form.systemPrompt.trim() || undefined,
      cooldownSeconds,
      severityThreshold,
    };
    return candidate as SpecialistFormData;
  }, [form]);

  function handleSubmit() {
    const parsed = specialistFormSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error("Please fix validation errors");
      return;
    }
    setErrors({});
    if (isEdit) updateMut.mutate(parsed.data);
    else createMut.mutate(parsed.data);
  }

  function toggleTrigger(evt: string) {
    setForm((prev) => ({
      ...prev,
      triggerEvents: prev.triggerEvents.includes(evt)
        ? prev.triggerEvents.filter((e) => e !== evt)
        : [...prev.triggerEvents, evt],
    }));
  }

  const showAnalyticalFields = form.class === "analytical";

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isEdit ? `Edit ${name}` : "Create Specialist"}
            {isEdit && detail?.config.class && (
              <Badge variant="secondary" className="text-[10px]">
                {detail.config.class}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update configuration for this specialist."
              : "Configure a new specialist agent."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {isEdit && detailLoading && (
            <div className="text-xs text-muted-foreground">Loading...</div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sp-name" className="text-xs">
              Name
            </Label>
            <Input
              id="sp-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={isEdit}
              placeholder="my-specialist"
            />
            {errors.name && (
              <p className="text-[11px] text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-desc" className="text-xs">
              Description
            </Label>
            <Input
              id="sp-desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Short description"
            />
            {errors.description && (
              <p className="text-[11px] text-destructive">
                {errors.description}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Class</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.class === "analytical" ? "default" : "secondary"}
                onClick={() => setForm({ ...form, class: "analytical" })}
              >
                analytical
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  form.class === "deterministic" ? "default" : "secondary"
                }
                onClick={() => setForm({ ...form, class: "deterministic" })}
              >
                deterministic
              </Button>
            </div>
          </div>

          {showAnalyticalFields && (
            <div className="space-y-1.5">
              <Label htmlFor="sp-model" className="text-xs">
                Model
              </Label>
              <Input
                id="sp-model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="sonnet, haiku, opus..."
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Trigger Events</Label>
            <div className="flex flex-wrap gap-2">
              {TRIGGER_EVENT_OPTIONS.map((evt) => {
                const selected = form.triggerEvents.includes(evt);
                return (
                  <Button
                    key={evt}
                    type="button"
                    size="xs"
                    variant={selected ? "default" : "secondary"}
                    onClick={() => toggleTrigger(evt)}
                  >
                    {evt}
                  </Button>
                );
              })}
            </div>
            {errors.triggerEvents && (
              <p className="text-[11px] text-destructive">
                {errors.triggerEvents}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-patterns" className="text-xs">
              Watch Patterns (one per line)
            </Label>
            <Textarea
              id="sp-patterns"
              value={form.watchPatterns}
              onChange={(e) =>
                setForm({ ...form, watchPatterns: e.target.value })
              }
              rows={3}
              placeholder="*.ts&#10;src/**/*.tsx"
            />
          </div>

          {showAnalyticalFields && (
            <div className="space-y-1.5">
              <Label htmlFor="sp-prompt" className="text-xs">
                System Prompt
              </Label>
              <Textarea
                id="sp-prompt"
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm({ ...form, systemPrompt: e.target.value })
                }
                rows={5}
                placeholder="You are a..."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-cd" className="text-xs">
                Cooldown (seconds)
              </Label>
              <Input
                id="sp-cd"
                type="number"
                min="0"
                value={form.cooldownSeconds}
                onChange={(e) =>
                  setForm({ ...form, cooldownSeconds: e.target.value })
                }
                placeholder="0"
              />
              {errors.cooldownSeconds && (
                <p className="text-[11px] text-destructive">
                  {errors.cooldownSeconds}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Severity Threshold</Label>
              <Select
                value={form.severityThreshold === "" ? undefined : form.severityThreshold}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    severityThreshold: v as FindingSeverity,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="critical">critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <SheetFooter>
          <div className="flex w-full items-center justify-between gap-2">
            {isEdit ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="text-destructive"
              >
                {deleteMut.isPending ? (
                  <Loader2 className="size-3 animate-spin mr-1" />
                ) : (
                  <Trash2 className="size-3 mr-1" />
                )}
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-3 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : isEdit ? (
                  "Save"
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
