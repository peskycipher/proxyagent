import { describe, it, expect, afterEach } from "vitest";
import { vastConfigured, vastChatUrl } from "@/lib/vast";
import { activeProvider } from "@/lib/inference";

const ENV_KEYS = ["VAST_API_KEY", "VAST_ENDPOINT_NAME", "MODEL_PROVIDER", "LLAMA_SERVER_URL"] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("vast provider selection", () => {
  it("is unconfigured without VAST_API_KEY or VAST_ENDPOINT_NAME", () => {
    expect(vastConfigured()).toBe(false);
    expect(vastChatUrl()).toBeNull();
  });

  it("is configured only when both vars are set", () => {
    setEnv({ VAST_API_KEY: "test-key", VAST_ENDPOINT_NAME: "my-llm" });
    expect(vastConfigured()).toBe(true);
    expect(vastChatUrl()).toBe("https://openai.vast.ai/my-llm/v1/chat/completions");
  });

  it("strips trailing slashes from the endpoint name", () => {
    setEnv({ VAST_API_KEY: "test-key", VAST_ENDPOINT_NAME: "my-llm/" });
    expect(vastChatUrl()).toBe("https://openai.vast.ai/my-llm/v1/chat/completions");
  });
});

describe("activeProvider", () => {
  it("defaults to runpod when nothing vast-related is configured", () => {
    setEnv({});
    expect(activeProvider()).toBe("runpod");
  });

  it("auto-selects vast when fully configured", () => {
    setEnv({ VAST_API_KEY: "test-key", VAST_ENDPOINT_NAME: "my-llm" });
    expect(activeProvider()).toBe("vast");
  });

  it("explicit MODEL_PROVIDER wins over auto-detection", () => {
    setEnv({ VAST_API_KEY: "k", VAST_ENDPOINT_NAME: "e", MODEL_PROVIDER: "runpod" });
    expect(activeProvider()).toBe("runpod");
    setEnv({ MODEL_PROVIDER: "vast" });
    expect(activeProvider()).toBe("vast");
  });
});