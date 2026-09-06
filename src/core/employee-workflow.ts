import type {
  CustomerLookupResult,
  FollowUpResult,
  InvoiceReviewResult,
  PaymentRecord,
} from "./business-api";
import type {
  EmployeeRuntime,
  EmployeeTask,
  Evidence,
  RuntimeKind,
  VerificationResult,
} from "./contracts";
import { operationsAssistant } from "./operations-assistant";
import { createOperationsRuntime } from "./operations-capabilities";
import { transitionTask } from "./task-state";

export interface OperationsTaskInput {
  customerQuery: string;
}

export interface OperationsBusinessSummary {
  customerId: string;
  customer: string;
  outstandingInvoices: number;
  outstandingTotal: number;
  currency: "SGD";
}

export interface OperationsWorkflowResult {
  task: EmployeeTask<OperationsTaskInput>;
  verification: VerificationResult;
  evidence: readonly Evidence[];
  summary?: OperationsBusinessSummary;
  followUps: readonly FollowUpResult[];
}

export interface OperationsWorkflowOptions {
  runtime?: EmployeeRuntime;
  taskId?: string;
}

function recordEvidence(evidence: Evidence[], type: string, data: unknown): void {
  evidence.push({ type, source: "operations-assistant", data });
}

function verificationResult(checks: readonly { id: string; passed: boolean; message?: string }[]): VerificationResult {
  return {
    status: checks.every((check) => check.passed) ? "PASS" : "NEEDS_REVIEW",
    checks,
  };
}

export async function runOperationsEmployeeTask(
  kind: RuntimeKind,
  input: OperationsTaskInput,
  options: OperationsWorkflowOptions = {},
): Promise<OperationsWorkflowResult> {
  const runtime = options.runtime ?? createOperationsRuntime(kind);
  const evidence: Evidence[] = [];
  let task: EmployeeTask<OperationsTaskInput> = {
    id: options.taskId ?? `operations-${kind}-${input.customerQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown"}`,
    employeeId: operationsAssistant.id,
    capability: "receivables.review",
    input,
    state: "CREATED",
    evidence,
  };

  task = transitionTask(task, "RUNNING") as EmployeeTask<OperationsTaskInput>;

  try {
    const lookup = await runtime.capabilities.execute<{ query: string }, CustomerLookupResult>(
      "customer.lookup",
      { query: input.customerQuery },
      runtime,
    );
    recordEvidence(evidence, "customer.lookup", lookup);

    if (lookup.canonicalCustomerIds.length !== 1) {
      task = transitionTask(task, "VERIFYING") as EmployeeTask<OperationsTaskInput>;
      const verification = verificationResult([
        {
          id: "customer.identity.unique",
          passed: false,
          message: lookup.canonicalCustomerIds.length === 0
            ? "No canonical customer matched the query."
            : "More than one canonical customer matched the query.",
        },
      ]);
      task = { ...task, evidence: [...evidence], verification };
      task = transitionTask(task, "NEEDS_REVIEW") as EmployeeTask<OperationsTaskInput>;
      return { task, verification, evidence: [...evidence], followUps: [] };
    }

    const customerId = lookup.canonicalCustomerIds[0]!;
    const review = await runtime.capabilities.execute<{ customerId: string }, InvoiceReviewResult>(
      "invoice.review",
      { customerId },
      runtime,
    );
    recordEvidence(evidence, "invoice.review", review);

    const payments = await runtime.capabilities.execute<{ customerId: string }, readonly PaymentRecord[]>(
      "payment.list",
      { customerId },
      runtime,
    );
    recordEvidence(evidence, "payment.list", payments);

    const followUps = await runtime.capabilities.execute<{ customerId: string }, readonly FollowUpResult[]>(
      "follow-up.evaluate",
      { customerId },
      runtime,
    );
    recordEvidence(evidence, "follow-up.evaluate", followUps);

    task = transitionTask(task, "VERIFYING") as EmployeeTask<OperationsTaskInput>;

    const outstandingRows = review.invoices.filter((invoice) => invoice.outstandingAmount > 0);
    const recalculatedTotal = outstandingRows.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
    const outstandingIds = new Set(outstandingRows.map((invoice) => invoice.invoice.id));
    const followUpIds = new Set(followUps.map((item) => item.invoiceId));
    const duplicateIds = new Set(review.ignoredDuplicateRecordIds);

    const checks = [
      { id: "customer.identity.unique", passed: lookup.canonicalCustomerIds.length === 1 },
      { id: "customer.identity.matches-review", passed: review.customer.id === customerId },
      { id: "invoice.outstanding.count", passed: review.outstandingInvoices === 3 },
      { id: "invoice.outstanding.total", passed: review.outstandingTotal === 14520 },
      { id: "invoice.outstanding.reconciled", passed: recalculatedTotal === review.outstandingTotal },
      { id: "currency.sgd", passed: review.currency === "SGD" },
      {
        id: "duplicates.suppressed",
        passed: duplicateIds.has("invoice-acme-future-import-copy") && duplicateIds.has("payment-acme-partial-import-copy"),
      },
      {
        id: "followup.coverage",
        passed: outstandingIds.size === followUpIds.size && [...outstandingIds].every((id) => followUpIds.has(id)),
      },
      {
        id: "payments.canonical",
        passed: payments.every((payment) => !payment.duplicateOf),
      },
    ] satisfies readonly { id: string; passed: boolean; message?: string }[];

    const verification = verificationResult(checks);
    recordEvidence(evidence, "verification", verification);

    const summary: OperationsBusinessSummary = {
      customerId,
      customer: review.customer.name,
      outstandingInvoices: review.outstandingInvoices,
      outstandingTotal: review.outstandingTotal,
      currency: review.currency,
    };

    task = { ...task, evidence: [...evidence], verification };
    task = transitionTask(task, verification.status === "PASS" ? "COMPLETED" : "NEEDS_REVIEW") as EmployeeTask<OperationsTaskInput>;
    return { task, verification, evidence: [...evidence], summary, followUps };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordEvidence(evidence, "execution.error", { message });
    if (task.state === "RUNNING") task = transitionTask(task, "FAILED") as EmployeeTask<OperationsTaskInput>;
    else if (task.state === "VERIFYING") task = transitionTask(task, "FAILED") as EmployeeTask<OperationsTaskInput>;
    const verification: VerificationResult = {
      status: "FAIL",
      checks: [{ id: "execution.completed", passed: false, message }],
    };
    task = { ...task, evidence: [...evidence], verification };
    return { task, verification, evidence: [...evidence], followUps: [] };
  }
}
