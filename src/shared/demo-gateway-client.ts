export const DEMO_GATEWAY_BASE_URL = "https://gpt.yapweijun1996.com/demo";
export const DEMO_GATEWAY_ORIGIN = "https://aiagent-sg-2026.github.io";
export const DEMO_GATEWAY_PROJECT_ID = "github-pages";

export const DEMO_MODELS = [
  "demo-auto",
  "demo-openai-mini",
  "demo-openai-quality",
  "demo-groq",
  "demo-gemini",
] as const;

export type DemoModel = (typeof DEMO_MODELS)[number];
export type DemoMessage = { role: "system" | "user" | "assistant"; content: string };

export class DemoGatewayError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DemoGatewayError";
  }
}

export class DemoGatewayRateLimitError extends DemoGatewayError {
  constructor() {
    super("The public demo is temporarily rate-limited. Please try again later.", 429);
    this.name = "DemoGatewayRateLimitError";
  }
}

export interface DemoChatRequest {
  model?: DemoModel;
  messages: readonly DemoMessage[];
}

export interface DemoGatewayClientOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  origin?: string;
  projectId?: string;
}

export interface DemoGatewayClient {
  chat(input: DemoChatRequest): Promise<unknown>;
  stream(input: DemoChatRequest): AsyncGenerator<string, void, void>;
}

function assertModel(model: string): asserts model is DemoModel {
  if (!(DEMO_MODELS as readonly string[]).includes(model)) {
    throw new DemoGatewayError(`Unsupported demo model: ${model}`);
  }
}

function assertMessages(messages: readonly DemoMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new DemoGatewayError("At least one text chat message is required.");
  }
  for (const message of messages) {
    if (!["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw new DemoGatewayError("Demo gateway accepts text-only chat messages.");
    }
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.trim().slice(0, 300);
}

export function createDemoGatewayClient(options: DemoGatewayClientOptions = {}): DemoGatewayClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? DEMO_GATEWAY_BASE_URL).replace(/\/$/, "");
  const origin = options.origin ?? DEMO_GATEWAY_ORIGIN;
  const projectId = options.projectId ?? DEMO_GATEWAY_PROJECT_ID;
  let token: string | null = null;

  async function createSession(): Promise<void> {
    const response = await fetchImpl(`${baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project_id: projectId }),
    });

    if (response.status === 403) {
      throw new DemoGatewayError("Demo gateway rejected the registered Origin. Check the GitHub Pages origin configuration.", 403);
    }
    if (response.status === 429) throw new DemoGatewayRateLimitError();
    if (!response.ok) {
      throw new DemoGatewayError(`Unable to create demo session${(await readError(response)) ? `: ${await readError(response)}` : ""}`, response.status);
    }

    const body = (await response.json()) as Record<string, unknown>;
    const nextToken = body.token ?? body.access_token ?? body.demo_token;
    if (typeof nextToken !== "string" || !nextToken) {
      throw new DemoGatewayError("Demo session response did not contain a bearer token.");
    }
    token = nextToken;
  }

  async function request(input: DemoChatRequest, stream: boolean, allowRefresh: boolean): Promise<Response> {
    const model = input.model ?? "demo-auto";
    assertModel(model);
    assertMessages(input.messages);
    if (token === null) await createSession();

    const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model, messages: input.messages, stream }),
    });

    if (response.status === 401 && allowRefresh) {
      token = null;
      await createSession();
      return request(input, stream, false);
    }
    if (response.status === 401) throw new DemoGatewayError("Demo session expired or was rejected after refresh.", 401);
    if (response.status === 403) {
      throw new DemoGatewayError("Demo gateway rejected the request Origin. It must exactly match the registered GitHub Pages origin.", 403);
    }
    if (response.status === 429) throw new DemoGatewayRateLimitError();
    if (!response.ok) {
      const detail = await readError(response);
      throw new DemoGatewayError(`Demo gateway request failed${detail ? `: ${detail}` : ""}`, response.status);
    }
    return response;
  }

  return {
    async chat(input) {
      const response = await request(input, false, true);
      return response.json();
    },

    async *stream(input) {
      const response = await request(input, true, true);
      if (!response.body) throw new DemoGatewayError("Demo gateway streaming response has no body.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            yield data;
          }
        }
      }
      buffer += decoder.decode();
      const trailing = buffer.trim();
      if (trailing.startsWith("data:")) {
        const data = trailing.slice(5).trim();
        if (data && data !== "[DONE]") yield data;
      }
    },
  };
}
