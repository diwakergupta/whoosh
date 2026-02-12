export function last24HoursRange(now: Date = new Date()): { start: string; end: string } {
  const endDate = new Date(now);
  const startDate = new Date(now);
  startDate.setHours(startDate.getHours() - 24);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export function buildFilter(start: string, end?: string): string {
  const params = new URLSearchParams();
  params.set("start", start);
  if (end) {
    params.set("end", end);
  }
  return params.toString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
