/**
 * Advanced client to interact with the advanced A2A agent via JSON-RPC.
 * Tests various AI capabilities with different credit costs.
 * Includes bearer token authentication support.
 */
import fetch from "node-fetch";
import { Readable } from "stream";
import {
  Payments,
  PushNotificationConfig,
  EnvironmentName,
} from "@nevermined-io/payments";
import { v4 as uuidv4 } from "uuid";
import "dotenv/config";
import express from "express";

interface AgentTestConfig {
  environment: EnvironmentName;
  nvmApiKey: string;
  planId: string;
  agentId: string;
  baseUrl: string;
}

function loadConfig(): AgentTestConfig {
  const { SUBSCRIBER_API_KEY, PLAN_ID, AGENT_ID } = process.env;
  if (!SUBSCRIBER_API_KEY || !PLAN_ID || !AGENT_ID) {
    throw new Error(
      "Missing required environment variables: SUBSCRIBER_API_KEY, PLAN_ID, AGENT_ID"
    );
  }
  return {
    environment: "local",
    nvmApiKey: SUBSCRIBER_API_KEY,
    planId: PLAN_ID,
    agentId: AGENT_ID,
    baseUrl: "http://localhost:41243/a2a",
  };
}

const config = loadConfig();

class TestAgentClient {
  paymentsService: any;
  config: AgentTestConfig;
  constructor(config: AgentTestConfig) {
    this.config = config;
    this.paymentsService = Payments.getInstance({
      environment: config.environment,
      nvmApiKey: config.nvmApiKey,
    });
  }
  async getAccessToken(): Promise<string | null> {
    const { planId, agentId } = this.config;
    if (!planId || !agentId) {
      console.error("Missing PLAN_ID or AGENT_ID in environment variables");
      return null;
    }
    try {
      const accessParams = await this.paymentsService.getAgentAccessToken(
        planId,
        agentId
      );
      return accessParams.accessToken;
    } catch (error: any) {
      console.error(`Failed to get access token: ${error.message}`);
      return null;
    }
  }
  async fetchAgentCard(): Promise<any | null> {
    const url = `${this.config.baseUrl}/.well-known/agent.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
      const agentCard = await response.json();
      console.log("Agent Card:", JSON.stringify(agentCard, null, 2));
      return agentCard;
    } catch (err) {
      console.error(`Failed to fetch agent card: ${err}`);
      return null;
    }
  }

  async getTask(taskId: string): Promise<any | null> {
    const payload = {
      jsonrpc: "2.0",
      method: "tasks/get",
      params: {
        id: taskId,
      },
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const response = await fetch(this.config.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`HTTP Error ${response.status}: ${response.statusText}`);
      return null;
    }
    return response.json();
  }

  /**
   * Sends a JSON-RPC request to the A2A agent with optional bearer token and push notification config.
   * @param message - The user message to send.
   * @param bearerToken - Optional bearer token for authentication.
   * @returns The full agent response (including taskId if present).
   */
  async sendMessage(message: string, bearerToken?: string) {
    const messageId = uuidv4();
    const payload = {
      jsonrpc: "2.0",
      method: "message/send",
      params: {
        message: {
          messageId,
          role: "user",
          parts: [{ kind: "text", text: message }],
        },
        configuration: {
          blocking: false,
        },
      },
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`HTTP Error ${response.status}: ${response.statusText}`);
        return null;
      }
      const data = await response.json();
      if (data && typeof data === "object" && "error" in data && data.error) {
        console.error("Error from agent:", data.error);
        return data;
      } else if (data && typeof data === "object" && "result" in data) {
        console.log("Agent response:", JSON.stringify(data.result, null, 2));
        return data;
      }
      return data;
    } catch (err) {
      console.error(`Request failed: ${err}`);
      return null;
    }
  }
  /**
   * Sends a streaming JSON-RPC request to the A2A agent with optional push notification config.
   * @param message - The user message to send.
   * @param bearerToken - Optional bearer token for authentication.
   * @param pushNotification - Optional push notification config to be sent with the request.
   *
   * According to the A2A standard, pushNotification must be a sibling of 'message' in 'params',
   * not inside 'message'.
   */
  async sendStreamingMessage(
    message: string,
    bearerToken?: string,
    pushNotification?: any
  ) {
    const messageId = uuidv4();
    const payload = {
      jsonrpc: "2.0",
      method: "message/stream",
      params: {
        message: {
          messageId,
          role: "user",
          parts: [{ kind: "text", text: message }],
        },
      },
    };
    // Per A2A standard, pushNotification must be a sibling of 'message' in 'params'
    if (pushNotification)
      (payload.params as any).pushNotification = pushNotification;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    const response = await fetch(this.config.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Failed to initiate streaming: ${response.statusText}`);
      return;
    }
    console.log("Streaming request sent. Processing SSE events...");
    const nodeStream = response.body as unknown as Readable;
    let buffer = "";
    let streamClosed = false;
    nodeStream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let eventEnd;
      while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);
        const dataLine = rawEvent
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (dataLine) {
          try {
            const data = JSON.parse(dataLine.slice(5).trim());
            console.log("[Streaming Event]", data);
            if (data?.result?.status?.final === true) {
              console.log(
                "[Streaming Event] Final event received. Closing stream."
              );
              streamClosed = true;
              nodeStream.destroy();
              break;
            }
          } catch (err) {
            console.error("[Streaming Event] Error parsing event:", err);
          }
        }
      }
    });
    nodeStream.on("end", () => {
      if (!streamClosed) {
        console.log("SSE stream closed by server.");
      }
    });
    nodeStream.on("error", (err) => {
      console.error("SSE stream error:", err);
    });
  }
  /**
   * Sets the push notification configuration for a given task using the A2A standard.
   * @param taskId - The ID of the task.
   * @param pushNotificationConfig - The push notification configuration object.
   * @param bearerToken - Optional bearer token for authentication.
   */
  async setPushNotificationConfig(
    taskId: string,
    pushNotificationConfig: any,
    bearerToken?: string
  ) {
    const payload = {
      jsonrpc: "2.0",
      method: "tasks/pushNotificationConfig/set",
      params: {
        taskId,
        pushNotificationConfig,
      },
      id: 1,
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`HTTP Error ${response.status}: ${response.statusText}`);
        return false;
      }
      const data = await response.json();
      if (data && typeof data === "object" && "error" in data && data.error) {
        console.error(
          "Error from agent (pushNotificationConfig/set):",
          data.error
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error(`Request failed (pushNotificationConfig/set): ${err}`);
      return false;
    }
  }
}

async function testBearerTokenFlow(client: TestAgentClient) {
  console.log("\n🧪 Testing A2A Payments Bearer Token Flow\n");
  const agentCard = await client.fetchAgentCard();
  if (!agentCard) return;
  const accessToken = await client.getAccessToken();
  if (!accessToken) return;
  await client.sendMessage("Hello there!", accessToken);
  await client.sendMessage("Calculate 15 * 7", accessToken);
  await client.sendMessage("Weather in London", accessToken);
  await client.sendMessage('Translate "hello" to Spanish', accessToken);
  console.log("\n🎉 Bearer token flow test completed!\n");
}

async function testInvalidBearerTokens(client: TestAgentClient) {
  console.log("\n🧪 Testing Invalid Bearer Token Handling\n");
  await client.sendMessage("Calculate 2+2", "undefined");
  await client.sendMessage("Weather in Tokyo", "null");
  await client.sendMessage('Translate "goodbye" to French', "fake.token.here");
  await client.sendMessage("Start streaming", "not-a-jwt-token");
  await client.sendMessage("Hello");
  await client.sendMessage("What is (25 + 15) * 2 / 4?", "");
  console.log("\n🎉 Invalid bearer token tests completed!\n");
}

async function testMixedTokenScenarios(client: TestAgentClient) {
  console.log("\n🧪 Testing Mixed Token Scenarios\n");
  const accessToken = await client.getAccessToken();
  if (!accessToken) return;
  await client.sendMessage("Hello", accessToken);
  await client.sendMessage("Calculate 5+5", "invalid-token");
  await client.sendMessage("Weather in Paris", "invalid-token");
  await client.sendMessage("Weather in Paris", accessToken);
  await client.sendMessage("Hello", accessToken);
  await client.sendMessage("Calculate 10 * 3", accessToken);
  await client.sendMessage("Weather in Berlin", accessToken);
  await client.sendMessage('Translate "thank you" to German', accessToken);
  console.log("\n🎉 Mixed token scenarios completed!\n");
}

async function testStreamingSSE(client: TestAgentClient) {
  console.log("\n🧪 Testing Streaming SSE\n");
  const accessToken = await client.getAccessToken();
  if (!accessToken) {
    console.error("No access token for streaming test");
    return;
  }
  client.sendStreamingMessage("Start streaming", accessToken);
  await new Promise((resolve) => setTimeout(resolve, 61000));
  console.log("✅ Streaming SSE test completed\n");
}

function startWebhookReceiver(client: TestAgentClient) {
  const app = express();
  app.use(express.json());
  app.post("/webhook", async (req, res) => {
    console.log("[Webhook] Notification received:", req.body);
    const task = await client.getTask(req.body.taskId);
    console.log("[Webhook] Task:", JSON.stringify(task, null, 2));
    res.status(200).send("OK");
  });
  const port = process.env.WEBHOOK_PORT || 4000;
  app.listen(port, () => {
    console.log(
      `[Webhook] Listening for push notifications on http://localhost:${port}/webhook`
    );
  });
}

async function testPushNotification(client: TestAgentClient) {
  const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:4000/webhook";
  const pushNotification: PushNotificationConfig = {
    url: webhookUrl,
    token: "test-token-abc",
    authentication: {
      credentials: "test-token-abc",
      schemes: ["bearer"],
    },
  };
  const accessToken = await client.getAccessToken();
  if (!accessToken) return;
  console.log("\n🧪 Testing push notification support (A2A standard flow)\n");
  // 1. Send message with push notification request
  const response = await client.sendMessage(
    "Testing push notification!",
    accessToken
  );
  // 2. Extract the taskId from the response
  let taskId = (response as any)?.result?.id;
  if (!taskId) {
    console.error("No taskId found in response:", response);
    return;
  }
  // 3. Associate the pushNotification config
  const setResult = await client.setPushNotificationConfig(
    taskId,
    pushNotification,
    accessToken
  );
  if (!setResult) {
    console.error("Failed to set push notification config");
    return;
  }
  console.log(`Push notification config set for taskId: ${taskId}`);
  console.log(
    "\n✅ Push notification test: config set. Check your webhook receiver after task completion.\n"
  );
}

async function testErrorHandling(client: TestAgentClient) {
  console.log("[Test] testErrorHandling not implemented yet.");
}

async function main() {
  const client = new TestAgentClient(config);
  startWebhookReceiver(client);
  await testBearerTokenFlow(client);
  await testInvalidBearerTokens(client);
  await testMixedTokenScenarios(client);
  await testStreamingSSE(client);
  await testPushNotification(client);
  await testErrorHandling(client);
}

if (require.main === module) {
  main().catch(console.error);
}
