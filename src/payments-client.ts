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
  const response = await client.sendAgentMessage(params);
  console.log("🚀 ~ sendMessage ~ response:", response);
  return response;
}

/**
 * Retrieves a task by its ID using automatic token management.
 */
async function getTask(client: any, taskId: string): Promise<GetTaskResponse> {
  const params = { id: taskId };
  return client.getAgentTask(params);
}

/**
 * Sets the push notification configuration for a given task.
 */
async function setPushNotificationConfig(
  client: any,
  taskId: string,
  pushNotificationConfig: PushNotificationConfig
): Promise<SetTaskPushNotificationConfigResponse> {
  return client.setAgentTaskPushNotificationConfig({
    taskId,
    pushNotificationConfig,
  });
}

/**
 * Starts a webhook receiver for push notifications.
 */
function startWebhookReceiver(client: any, config: AgentTestConfig) {
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
    const stream = await client.sendAgentMessageStream(params);
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
 * Test: sendMessageStream (streaming) using the modern RegisteredPaymentsClient API
 */
async function testSendMessageStream(client: any) {
  console.log("\n🧪 Testing sendMessageStream (streaming)\n");
  const messageId = uuidv4();
  const params: MessageSendParams = {
    message: {
      messageId,
      role: "user",
      kind: "message",
      parts: [{ kind: "text", text: "Stream me some updates!" }],
    },
  };
  try {
    const stream = await client.sendAgentMessageStream(params);
    for await (const event of stream) {
      console.log("[sendMessageStream Event]", event);
      if (event?.result?.status?.final === true) {
        console.log("[sendMessageStream] Final event received.");
        break;
      }
    }
    console.log("✅ sendMessageStream test completed\n");
  } catch (err) {
    console.error("sendMessageStream error:", err);
  }
}

/**
 * Test: resubscribeTask using the modern RegisteredPaymentsClient API
 */
async function testResubscribeTask(client: any, taskId: string) {
  console.log("\n🧪 Testing resubscribeTask\n");
  try {
    const stream = await client.resubscribeAgentTask({ id: taskId });
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
 * Test: Error Handling (stub)
 */
async function testErrorHandling(client: any) {
  // TODO: Implement error handling test using the RegisteredPaymentsClient API
  throw new Error("testErrorHandling not implemented yet.");
}

/**
 * Main entrypoint to run all test scenarios for the A2A payments client.
 */
async function main() {
  const client1 = createA2AClient(config);

  //   startWebhookReceiver(client1, config);
  await testGeneralFlow(client1);
  //   await testStreamingSSE(client1);
  //   await testSendMessageStream(client1);
  //   const response = await sendMessage(client1, "Task for resubscribe test");
  //   const taskId = (response as any)?.result?.id;
  //   if (taskId) {
  //     await testResubscribeTask(client1, taskId);
  //   }
  //   await testPushNotification(client1);
  //   await testErrorHandling(client1);
}

if (require.main === module) {
  main().catch(console.error);
}
