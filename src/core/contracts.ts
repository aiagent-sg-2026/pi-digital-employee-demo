export type RuntimeKind = "node" | "browser";

export type TaskState =
  | "CREATED"
  | "RUNNING"
  | "VERIFYING"
  | "COMPLETED"
  | "NEEDS_REVIEW"
  | "FAILED";

export interface Evidence {
  type: string;
  source: string;
  data: unknown;
}

export interface VerificationCheck {
  id: string;
  description: string;
  run: (evidence: readonly Evidence[]) => Promise<boolean> | boolean;
}

export interface VerificationResult {
  status: "PASS" | "NEEDS_REVIEW" | "FAIL";
  checks: readonly { id: string; passed: boolean; message?: string }[];
}

export interface EmployeeSkill {
  id: string;
  name: string;
  capabilities: readonly string[];
}

export interface EmployeeTool<Input = unknown, Output = unknown> {
  capability: string;
  description: string;
  execute: (input: Input, runtime: EmployeeRuntime) => Promise<Output> | Output;
}

export interface EmployeeRuntime {
  kind: RuntimeKind;
  capabilities: CapabilityRegistry;
}

export interface EmployeeDefinition {
  id: string;
  name: string;
  role: string;
  skills: readonly EmployeeSkill[];
  systemPrompt?: string;
  verificationChecks?: readonly VerificationCheck[];
}

export interface EmployeeTask<Input = unknown> {
  id: string;
  employeeId: string;
  capability: string;
  input: Input;
  state: TaskState;
  evidence: readonly Evidence[];
  verification?: VerificationResult;
}

export interface EmployeeEvent {
  type: "TASK_CREATED" | "TASK_STARTED" | "TASK_VERIFYING" | "TASK_COMPLETED" | "TASK_NEEDS_REVIEW" | "TASK_FAILED" | "EVIDENCE_RECORDED";
  taskId: string;
  timestamp: number;
  details?: unknown;
}

export interface CapabilityRegistry {
  register<Input = unknown, Output = unknown>(tool: EmployeeTool<Input, Output>): void;
  has(capability: string): boolean;
  resolve<Input = unknown, Output = unknown>(capability: string): EmployeeTool<Input, Output>;
  execute<Input = unknown, Output = unknown>(capability: string, input: Input, runtime: EmployeeRuntime): Promise<Output>;
}
