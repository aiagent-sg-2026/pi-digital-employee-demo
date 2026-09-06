import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const model: Model<any> = {
  id: "phase0-deterministic",
  name: "Phase 0 Deterministic",
  api: "openai-responses",
  provider: "phase0",
  baseUrl: "local://phase0",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 512,
};

export interface DemoEvidence {
  runtime: "node" | "browser";
  customer: string;
  outstandingInvoices: number;
  outstandingTotal: number;
  currency: "SGD";
  toolExecutions: number;
  verification: "PASS";
}

const invoiceParameters = Type.Object({
  customer: Type.String(),
  runtime: Type.Union([Type.Literal("node"), Type.Literal("browser")]),
});

export const invoiceTool: AgentTool<typeof invoiceParameters, DemoEvidence> = {
  name: "review_customer_invoices",
  label: "Review customer invoices",
  description: "Return deterministic Phase 0 invoice evidence for ACME.",
  parameters: invoiceParameters,
  async execute(_toolCallId, params) {
    const evidence: DemoEvidence = {
      runtime: params.runtime,
      customer: params.customer,
      outstandingInvoices: 3,
      outstandingTotal: 14520,
      currency: "SGD",
      toolExecutions: 1,
      verification: "PASS",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(evidence) }],
      details: evidence,
    };
  },
};

function makeMessage(context: Context, runtime: "node" | "browser"): AssistantMessage {
  const last = context.messages.at(-1);
  const afterTool = last?.role === "toolResult";
  if (!afterTool) {
    return {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "phase0-tool-call",
          name: "review_customer_invoices",
          arguments: { customer: "ACME Trading Pte Ltd", runtime },
        },
      ],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
  }

  return {
    role: "assistant",
    content: [{ type: "text", text: "PHASE0_TOOL_LOOP_PASS" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function deterministicStream(runtime: "node" | "browser", _model: Model<any>, context: Context) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    const message = makeMessage(context, runtime);
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
    stream.end();
  });
  return stream;
}

export async function runPhase0(runtime: "node" | "browser") {
  const events: AgentEvent[] = [];
  const agent = new Agent({
    initialState: {
      systemPrompt: "Phase 0 portability proof. Use the available invoice tool exactly once.",
      model,
      thinkingLevel: "off",
      messages: [],
      tools: [invoiceTool],
    },
    streamFn: (model, context) => deterministicStream(runtime, model, context),
  });

  agent.subscribe((event) => { events.push(event); });
  await agent.prompt(`Run the ACME invoice review in ${runtime}.`);

  const toolEnd = events.find((event) => event.type === "tool_execution_end");
  const agentEnd = events.at(-1);
  if (!toolEnd || toolEnd.type !== "tool_execution_end") {
    throw new Error("Pi did not execute the tool.");
  }
  if (!agentEnd || agentEnd.type !== "agent_end") {
    throw new Error("Pi agent did not finish cleanly.");
  }

  const evidence = toolEnd.result.details as DemoEvidence;
  return { evidence, events: events.map((event) => event.type) };
}
