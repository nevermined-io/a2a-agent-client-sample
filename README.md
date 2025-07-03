# A2A Payments Agent Example

This example demonstrates how to use the Nevermined payments library with the Agent2Agent (A2A) protocol, including bearer token authentication, asynchronous task management, and push notification support.

## Features

- **Bearer Token Authentication**: The server extracts bearer tokens from the `Authorization` header and injects them into the task context.
- **Credit Validation**: Validates that the user has sufficient credits before executing a task.
- **Credit Burning**: Burns the credits specified in the result after successful execution.
- **Push Notifications**: Supports the A2A standard flow for push notification configuration and delivery.
- **Asynchronous Task Handling**: Supports intermediate and final state events, compatible with polling and streaming.
- **Unified Agent/Client**: There is a single agent and client implementation.

## Project Structure

```
src/
├── agent.ts      # A2A agent with payments, async, and push notification support
├── client.ts     # Client for interacting with the agent
```

## Quick Start

### 1. Environment Setup

Create a `.env` file with the following variables:

```env
PUBLISHER_API_KEY=your_publisher_api_key_here
SUBSCRIBER_API_KEY=your_subscriber_api_key_here
AGENT_ID=your_agent_id_here
PLAN_ID=your_plan_id_here
```

### 2. Build and Run the Agent

```bash
npm run build
node dist/agent.js
```

The agent will start on port 41243 by default.

### 3. Run the Client

```bash
node dist/client.js
```

The client will test various flows, including bearer token, push notification, streaming, and error handling.

---

## Agent Initialization and Executor Definition

The agent is initialized using the Nevermined payments library and the A2A protocol. The executor defines the business logic for each type of request.

```typescript
import { Payments, a2a } from "@nevermined-io/payments";

const paymentsService = Payments.getInstance({
  environment: "local",
  nvmApiKey: process.env.PUBLISHER_API_KEY,
});

const agentCard = a2a.buildPaymentAgentCard(baseAgentCard, {
  paymentType: "dynamic",
  credits: 1,
  planId: process.env.PLAN_ID,
  agentId: process.env.AGENT_ID,
});

class Executor implements AgentExecutor {
  async handleTask(context, eventBus) {
    // ... see agent.ts for full logic ...
    // Returns { result: TaskHandlerResult, expectsMoreUpdates: boolean }
  }
  async cancelTask(taskId) { /* ... */ }

  /**
   * Required by the A2A SDK. Publishes the result of handleTask as a final status-update event.
   * Handles asynchronous flows and ensures the correct event lifecycle.
   * @param requestContext - The task context.
   * @param eventBus - The event bus to publish events.
   */
  async execute(requestContext, eventBus) {
    // Example: see agent.ts for full implementation
    const { result, expectsMoreUpdates } = await this.handleTask(requestContext, eventBus);
    if (expectsMoreUpdates) return;
    // Publish final status-update event
    // ...
  }
}

paymentsService.a2a.start({
  agentCard,
  executor: new Executor(),
  port: 41243,
  basePath: "/a2a/",
});
```

- The `Executor` class routes and handles all supported operations (greeting, calculation, weather, translation, streaming, push notification).
- The `handleTask` method returns both the result and a boolean indicating if more updates are expected (for async flows).
- The agent publishes the initial task, intermediate status updates, and the final event as per the A2A standard.

---

## Client Usage: Sending Tasks and Push Notification Config

The client interacts with the agent using JSON-RPC requests. It can send messages, poll for task status, and associate push notification configs.

### Sending a Task

```typescript
const response = await client.sendMessage(
  "Testing push notification!",
  accessToken
);
const taskId = response?.result?.id;
```

### Associating Push Notification Config

```typescript
const pushNotification = {
  url: "http://localhost:4000/webhook",
  token: "test-token-abc",
  authentication: {
    credentials: "test-token-abc",
    schemes: ["bearer"],
  },
};
const setResult = await client.setPushNotificationConfig(
  taskId,
  pushNotification,
  accessToken
);
```

### Polling for Task Status

```typescript
const task = await client.getTask(taskId);
console.log("Task status:", task.status.state);
```

### Webhook Receiver Example

```typescript
app.post("/webhook", async (req, res) => {
  console.log("[Webhook] Notification received:", req.body);
  const task = await client.getTask(req.body.taskId);
  console.log("[Webhook] Task:", JSON.stringify(task, null, 2));
  res.status(200).send("OK");
});
```

---

## Complete Flow

1. **Client gets access token**: Uses API key to call `getAgentAccessToken`.
2. **Client sends request**: Includes access token in `Authorization` header using `sendMessage`.
3. **Agent receives and creates the task**: Publishes the initial task event.
4. **Agent publishes intermediate status-update events**: For long-running or async tasks, publishes `status-update` events with `final: false`.
5. **Client can poll or stream events**: Using `getTask` or streaming endpoints.
6. **Client associates push notification config**: Calls `setPushNotificationConfig` with the `taskId`.
7. **Agent publishes final status-update event**: With `final: true` and triggers push notification if configured.
8. **Webhook receiver gets notified**: When the task is completed.

---

## CLI Instructions

### Build

```bash
npm run build
```

### Run the Agent

```bash
node dist/agent.js
```

### Run the Client

```bash
node dist/client.js
```

- The client will run all test flows: bearer token, invalid tokens, mixed scenarios, streaming, push notification, and error handling.
- You can comment/uncomment specific tests in `client.ts` as needed.

---

## Troubleshooting

- **Port conflicts**: Ensure port 41243 is available.
- **Environment variables**: Check that all required env vars are set.
- **API key permissions**: Verify your API key has the necessary permissions.
- **Webhook not received**: Ensure the push notification config is set before the task completes.
- **Streaming not working**: Check that both agent and client support SSE and that events are published.

---

## Further Reading
- [Nevermined Documentation](https://docs.nevermined.app)
- [A2A Protocol Specification](https://a2aproject.github.io/A2A/latest)
- [GitHub Repository](https://github.com/nevermined-io/payments) 