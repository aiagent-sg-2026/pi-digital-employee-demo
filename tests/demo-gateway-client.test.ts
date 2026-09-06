import { describe, expect, it, vi } from "vitest";
import {
  createDemoGatewayClient,
  DemoGatewayError,
  DemoGatewayRateLimitError,
} from "../src/shared/demo-gateway-client";

const token = "secret-demo-token";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("demo gateway client", () => {
  it("creates a session before chat and sends only the allowed chat payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token }))
      .mockResolvedValueOnce(json({ choices: [] }));
    const client = createDemoGatewayClient({ fetch: fetchMock as typeof fetch });

    await client.chat({ messages: [{ role: "user", content: "Hello" }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0]!;
    expect(sessionUrl).toBe("https://gpt.yapweijun1996.com/demo/session");
    expect(sessionInit.headers).toMatchObject({ Origin: "https://yapweijun1996.github.io", "Content-Type": "application/json" });
    expect(JSON.parse(sessionInit.body)).toEqual({ project_id: "github-pages" });

    const [chatUrl, chatInit] = fetchMock.mock.calls[1]!;
    expect(chatUrl).toBe("https://gpt.yapweijun1996.com/demo/v1/chat/completions");
    expect(chatInit.headers.Authorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(chatInit.body)).toEqual({ model: "demo-auto", messages: [{ role: "user", content: "Hello" }], stream: false });
    expect(Object.keys(JSON.parse(chatInit.body)).sort()).toEqual(["messages", "model", "stream"]);
    expect(JSON.stringify(chatInit.body)).not.toContain(token);
    expect(Object.keys(client)).toEqual(["chat", "stream"]);
  });

  it("refreshes once after a 401 and retries once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: "t1" }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ token: "t2" }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "ok" } }] }));
    const client = createDemoGatewayClient({ fetch: fetchMock as typeof fetch });
    await client.chat({ messages: [{ role: "user", content: "Hello" }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1].headers.Authorization).toBe("Bearer t2");
  });

  it("does not retry a second 401", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: "t1" }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ token: "t2" }))
      .mockResolvedValueOnce(json({}, 401));
    const client = createDemoGatewayClient({ fetch: fetchMock as typeof fetch });
    await expect(client.chat({ messages: [{ role: "user", content: "Hello" }] })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("surfaces 403 and 429 without aggressive retry", async () => {
    const forbidden = vi.fn().mockResolvedValue(json({}, 403));
    await expect(createDemoGatewayClient({ fetch: forbidden as typeof fetch }).chat({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(DemoGatewayError);
    expect(forbidden).toHaveBeenCalledTimes(1);

    const limited = vi.fn().mockResolvedValue(json({}, 429));
    await expect(createDemoGatewayClient({ fetch: limited as typeof fetch }).chat({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(DemoGatewayRateLimitError);
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it("parses streaming SSE data and requests stream=true", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"delta":"A"}\n\ndata: {"delta":"B"}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const client = createDemoGatewayClient({ fetch: fetchMock as typeof fetch });
    const events: string[] = [];
    for await (const event of client.stream({ model: "demo-groq", messages: [{ role: "user", content: "x" }] })) events.push(event);
    expect(events).toEqual(['{"delta":"A"}', '{"delta":"B"}']);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ model: "demo-groq", messages: [{ role: "user", content: "x" }], stream: true });
  });
});
