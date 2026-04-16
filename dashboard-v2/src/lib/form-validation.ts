export function isTaskFormValid(title: string): boolean {
  return title.trim().length > 0;
}

export function isWebhookFormValid(repo: string, eventTypes: string[]): boolean {
  return repo.trim().length > 0 && eventTypes.length > 0;
}

export function isSchedulerFormValid(
  name: string,
  cron: string,
  action: string,
): boolean {
  return (
    name.trim().length > 0 &&
    cron.trim().length > 0 &&
    action.trim().length > 0
  );
}
