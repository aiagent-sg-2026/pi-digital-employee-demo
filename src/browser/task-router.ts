export type TaskIntent = "receivables-review" | "unknown-customer-demo" | "approval-demo" | "unsupported";

export interface RoutedTask {
  intent: TaskIntent;
  customerQuery: string;
  context: string;
  reason?: string;
}

const SUPPORTED_MESSAGE = "This V1 demo supports ACME receivables review, the unknown-customer exception test, and the demo approval flow.";

export function routeDashboardTask(task: string): RoutedTask {
  const normalized = task.trim();
  const words = normalized.toLowerCase();

  if (words.includes("demo approval") || words.includes("approval flow")) {
    return { intent: "approval-demo", customerQuery: "ACME", context: "ACME Trading Pte Ltd · Demo approval gate" };
  }

  if (words.includes("unknown-customer") || words.includes("unknown customer") || words.includes("no-such") || words.includes("exception scenario")) {
    return { intent: "unknown-customer-demo", customerQuery: "NO-SUCH-CUSTOMER", context: "Demo exception scenario" };
  }

  const mentionsAcme = words.split(/[^a-z0-9]+/).includes("acme");
  const supportedBusinessTerms = ["invoice", "receivable", "outstanding", "follow-up", "followup", "customer"];
  if (mentionsAcme && supportedBusinessTerms.some((term) => words.includes(term))) {
    return { intent: "receivables-review", customerQuery: "ACME", context: "ACME Trading Pte Ltd" };
  }

  return { intent: "unsupported", customerQuery: "", context: "Unsupported demo capability", reason: SUPPORTED_MESSAGE };
}
