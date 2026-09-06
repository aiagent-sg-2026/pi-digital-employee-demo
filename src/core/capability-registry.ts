import type { CapabilityRegistry, EmployeeRuntime, EmployeeTool } from "./contracts";

export class MissingCapabilityError extends Error {
  constructor(public readonly capability: string) {
    super(`Capability is not registered: ${capability}`);
    this.name = "MissingCapabilityError";
  }
}

export class Registry implements CapabilityRegistry {
  private readonly tools = new Map<string, EmployeeTool>();

  register<Input = unknown, Output = unknown>(tool: EmployeeTool<Input, Output>): void {
    if (!tool.capability.trim()) throw new Error("Capability name must not be empty.");
    if (this.tools.has(tool.capability)) throw new Error(`Capability is already registered: ${tool.capability}`);
    this.tools.set(tool.capability, tool as EmployeeTool);
  }

  has(capability: string): boolean {
    return this.tools.has(capability);
  }

  resolve<Input = unknown, Output = unknown>(capability: string): EmployeeTool<Input, Output> {
    const tool = this.tools.get(capability);
    if (!tool) throw new MissingCapabilityError(capability);
    return tool as EmployeeTool<Input, Output>;
  }

  async execute<Input = unknown, Output = unknown>(capability: string, input: Input, runtime: EmployeeRuntime): Promise<Output> {
    return this.resolve<Input, Output>(capability).execute(input, runtime);
  }
}
