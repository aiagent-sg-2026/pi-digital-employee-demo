import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, Type, type AssistantMessage, type Context, type Model } from "@earendil-works/pi-ai";
import type { EmployeeDefinition, EmployeeRuntime, Evidence } from "../../core";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const model: Model<any> = { id: "phase0-deterministic", name: "Phase 0 Deterministic", api: "openai-responses", provider: "phase0", baseUrl: "local://phase0", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 4096, maxTokens: 512 };
const parameters = Type.Object({ customer: Type.String(), runtime: Type.Union([Type.Literal("node"), Type.Literal("browser")]) });

export interface PiRunResult { events: AgentEvent[]; evidence: Evidence; }

export async function runPiCapabilityLoop(employee: EmployeeDefinition, runtime: EmployeeRuntime, capability: string, input: { customer: string }): Promise<PiRunResult> {
  const tool: AgentTool<typeof parameters, Evidence> = {
    name: capability, label: capability, description: "Execute a registered employee capability.", parameters,
    async execute(_toolCallId, params) {
      const evidence = await runtime.capabilities.execute<unknown, Evidence>(capability, params, runtime);
      return { content: [{ type: "text", text: JSON.stringify(evidence) }], details: evidence };
    },
  };
  function message(context: Context): AssistantMessage {
    if (context.messages.at(-1)?.role !== "toolResult") return { role: "assistant", content: [{ type: "toolCall", id: "phase0-tool-call", name: capability, arguments: { ...input, runtime: runtime.kind } }], api: model.api, provider: model.provider, model: model.id, usage, stopReason: "toolUse", timestamp: Date.now() };
    return { role: "assistant", content: [{ type: "text", text: "PHASE0_TOOL_LOOP_PASS" }], api: model.api, provider: model.provider, model: model.id, usage, stopReason: "stop", timestamp: Date.now() };
  }
  function stream(_model: Model<any>, context: Context) {
    const result = createAssistantMessageEventStream();
    queueMicrotask(() => { const next = message(context); result.push({ type: "start", partial: next }); result.push({ type: "done", reason: next.stopReason as "stop" | "toolUse", message: next }); result.end(); });
    return result;
  }
  const events: AgentEvent[] = [];
  const agent = new Agent({ initialState: { systemPrompt: employee.systemPrompt ?? "", model, thinkingLevel: "off", messages: [], tools: [tool] }, streamFn: stream });
  agent.subscribe((event) => { events.push(event); });
  await agent.prompt(`Run the ${capability} task for ${input.customer}.`);
  const toolEnd = events.find((event) => event.type === "tool_execution_end");
  if (!toolEnd || toolEnd.type !== "tool_execution_end") throw new Error("Pi did not execute the capability.");
  if (events.at(-1)?.type !== "agent_end") throw new Error("Pi agent did not finish cleanly.");
  return { events, evidence: toolEnd.result.details as Evidence };
}
