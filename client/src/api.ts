import type { Alert, CaseView } from "../../server/src/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  listAlerts: () => request<Alert[]>("/alerts"),
  listPolicies: () => request<string[]>("/policies"),
  getCase: () => request<CaseView>("/case"),
  addAlert: (alertId: number) =>
    request<CaseView>("/case/alerts", { method: "POST", body: JSON.stringify({ alertId }) }),
  removeAlert: (alertId: number) => request<CaseView>(`/case/alerts/${alertId}`, { method: "DELETE" }),
  setPolicies: (policies: string) =>
    request<CaseView>("/case/policies", { method: "PUT", body: JSON.stringify({ policies }) }),
  clearCase: () => request<CaseView>("/case", { method: "DELETE" }),
};
