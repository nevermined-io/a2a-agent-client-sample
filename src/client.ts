import {
  Payments,
  EnvironmentName,
  MessageSendParams,
  GetTaskResponse,
  SetTaskPushNotificationConfigResponse,
  PushNotificationConfig,
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

  // Default values when not provided via environment variables
  const defaultSubscriberApiKey =
    "eyJhbGciOiJFUzI1NksifQ.eyJpc3MiOiIweDU4MzhCNTUxMmNGOWYxMkZFOWYyYmVjY0IyMGViNDcyMTFGOUIwYmMiLCJzdWIiOiIweDEzOTgzNERGN2MxODE4OEU4RjczM0JDMTFFOUU1OTdCODg1NjNCNTkiLCJqdGkiOiIweDM4ZTY2ZTBhYTM4ZGRhZWY5YjQ2ZjlhY2IwYjY1MjljNGRjYjczZWZjMTEwMWNiODhkMjczZWEwMzNhMTU5YTIiLCJleHAiOjE3ODYwNjU0ODJ9.nhsDccnsdCIL39I9_seeIqbwsV9TpisdX8OhrE3dzIUwURN5d9eS7YamKPct33GC9Ja8_cTa5QalQiFMhQe-8hw";
  const defaultPlanId =
    "38903382680661089761144463553411737235237456544456064481459352422894111390695";
  const defaultAgentId =
    "did:nv:8f87ac874094cc115935b399082479119e68c542c0f40167859577f34a1bbb53";

  return {
    environment: "staging_sandbox",
    nvmApiKey: SUBSCRIBER_API_KEY || defaultSubscriberApiKey,
    planId: PLAN_ID || defaultPlanId,
    agentId: AGENT_ID || defaultAgentId,
    baseUrl: "http://localhost:41243/a2a",
  };
}

const config = loadConfig();
const payments = Payments.getInstance({
  environment: config.environment,
  nvmApiKey: config.nvmApiKey,
});

/**
 * Creates a new A2A client instance for a given agent config.
 */
function createA2AClient(cfg: AgentTestConfig) {
  return payments.a2a.getClient({
    agentBaseUrl: cfg.baseUrl,
    agentId: cfg.agentId,
    planId: cfg.planId,
  });
}

/**
 * Sends a message to the agent using automatic token management.
 */
async function sendMessage(client: any, message: string): Promise<any> {
  const messageId = uuidv4();
  const params: MessageSendParams = {
    message: {
      messageId,
      role: "user",
      kind: "message",
      parts: [{ kind: "text", text: message }],
    },
  };
  const response = await client.sendA2AMessage(params);
  console.log("🚀 ~ sendMessage ~ response:", response);
  return response;
}

/**
 * Retrieves a task by its ID using automatic token management.
 */
async function getTask(client: any, taskId: string): Promise<GetTaskResponse> {
  const params = { id: taskId };
  return client.getA2ATask(params);
}

/**
 * Sets the push notification configuration for a given task.
 */
async function setPushNotificationConfig(
  client: any,
  taskId: string,
  pushNotificationConfig: PushNotificationConfig
): Promise<SetTaskPushNotificationConfigResponse> {
  return client.setA2ATaskPushNotificationConfig({
    taskId,
    pushNotificationConfig,
  });
}

/**
 * Starts a webhook receiver for push notifications.
 */
function startWebhookReceiver(client: any) {
  const app = express();
  app.use(express.json());
  app.post("/webhook", async (req, res) => {
    console.log("[Webhook] Notification received:", req.body);
    const task = await getTask(client, req.body.taskId);
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

/**
 * Test: General Flow
 */
async function testGeneralFlow(client: any) {
  console.log("\n🧪 Testing A2A Payments General Flow\n");
  await sendMessage(client, "Hello there!");
  await sendMessage(client, "Calculate 15 * 7");
  await sendMessage(client, "Weather in London");
  await sendMessage(client, 'Translate "hello" to Spanish');
  console.log("\n🎉 General flow test completed!\n");
}

/**
 * Test: Streaming SSE using the modern RegisteredPaymentsClient API
 */
async function testStreamingSSE(client: any) {
  console.log("\n🧪 Testing Streaming SSE\n");
  const messageId = uuidv4();
  const params: MessageSendParams = {
    message: {
      messageId,
      role: "user",
      kind: "message",
      parts: [{ kind: "text", text: "Start streaming" }],
    },
  };
  try {
    const stream = await client.sendA2AMessageStream(params);
    for await (const event of stream) {
      console.log("[Streaming Event]", event);
      if (event?.result?.status?.final === true) {
        console.log("[Streaming Event] Final event received.");
        break;
      }
    }
    console.log("✅ Streaming SSE test completed\n");
  } catch (err) {
    console.error("Streaming SSE error:", err);
  }
}

/**
 * Test: resubscribeTask using the modern RegisteredPaymentsClient API
 */
async function testResubscribeTask(client: any, taskId: string) {
  console.log("\n🧪 Testing resubscribeTask\n");
  try {
    const stream = await client.resubscribeA2ATask({ id: taskId });
    for await (const event of stream) {
      console.log("[resubscribeTask Event]", event);
      if (event?.result?.status?.final === true) {
        console.log("[resubscribeTask] Final event received.");
        break;
      }
    }
    console.log("✅ resubscribeTask test completed\n");
  } catch (err) {
    console.error("resubscribeTask error:", err);
  }
}

/**
 * Test: Push Notification using the modern RegisteredPaymentsClient API
 */
async function testPushNotification(client: any) {
  if (process.env.ASYNC_EXECUTION === "false" || !process.env.ASYNC_EXECUTION) {
    console.log(
      "🚨 Async execution is disabled. Push notification test will fail."
    );
    return;
  }
  const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:4000/webhook";
  const pushNotification: PushNotificationConfig = {
    url: webhookUrl,
    token: "test-token-abc",
    authentication: {
      credentials: "test-token-abc",
      schemes: ["bearer"],
    },
  };
  // 1. Send message to create a task
  const response = await sendMessage(client, "Testing push notification!");
  let taskId = (response as any)?.result?.id;
  if (!taskId) {
    console.error("No taskId found in response:", response);
    return;
  }
  // 2. Associate the pushNotification config
  const setResult = await setPushNotificationConfig(
    client,
    taskId,
    pushNotification
  );
  if (!setResult) {
    console.error("Failed to set push notification config");
    return;
  }
  console.log(`Push notification config set for taskId: ${taskId}`);
  console.log(
    "\n✅ Push notification test: config set. Check webhook receiver after task completion.\n"
  );
}

/**
 * Test: Error handling in the A2A payments client.
 * Sends an invalid message to the agent and verifies that the error is properly caught and logged.
 */
async function testErrorHandling(client: any) {
  console.log("\n🧪 Testing error handling\n");
  // Create a message with an invalid 'parts' value (empty array), which should trigger a server-side error but satisfy the type.
  const messageId = uuidv4();
  const params: MessageSendParams = {
    message: {
      messageId,
      role: "user",
      kind: "message",
      parts: [], // Intentionally invalid: empty array is not allowed semantically
    },
  };
  try {
    // Try sending the malformed message
    await client.sendA2AMessage(params);
    console.error(
      "❌ Error: The agent did not throw an error for a malformed message."
    );
  } catch (err) {
    const error = err as Error;
    console.log("✅ Error correctly caught:", error.message || error);
  }
}

/**
 * Test: Streaming SSE with simulated client disconnect and resubscribe.
 * Starts a streaming session, disconnects after a few events, then resubscribes to the task.
 */
async function testStreamingSSEWithDisconnect(client: any) {
  console.log("\n🧪 Testing Streaming SSE with disconnect and resubscribe\n");
  const messageId = uuidv4();
  const params: MessageSendParams = {
    message: {
      messageId,
      role: "user",
      kind: "message",
      parts: [{ kind: "text", text: "Start streaming with disconnect" }],
    },
  };
  let taskId: string | undefined;
  try {
    const stream = await client.sendA2AMessageStream(params);
    let count = 0;
    for await (const event of stream) {
      console.log("[Streaming Event]", event);
      if (!taskId && event?.id) {
        taskId = event.id;
      }
      count++;
      if (count === 3) {
        console.log("⛔️ Simulating client disconnect after 3 events");
        break; // Simulate disconnect
      }
    }
    if (taskId) {
      await testResubscribeTask(client, taskId);
    } else {
      console.error("Could not obtain taskId for resubscribe test");
    }
  } catch (err) {
    console.error("Streaming SSE error:", err);
  }
}

async function checkPlanBalance(config: AgentTestConfig) {
  const balance = await payments.plans.getPlanBalance(config.planId);
  console.log("💰 Plan balance:", balance.balance);
  if (balance.balance.toString() === "0") {
    console.log("🚨 Plan balance is 0. Purchasing plan...");
    const result = await payments.plans.orderPlan(config.planId);
    console.log("💰 Plan purchased:", result);
  }
}

/**
 * Main entrypoint to run all test scenarios for the A2A payments client.
 */
async function main() {
  await checkPlanBalance(config);
  const client1 = createA2AClient(config);

  startWebhookReceiver(client1);
  await testGeneralFlow(client1);
  await testStreamingSSE(client1);
  await testStreamingSSEWithDisconnect(client1);

  await testPushNotification(client1);
  await testErrorHandling(client1);
}

if (require.main === module) {
  main().catch(console.error);
}
