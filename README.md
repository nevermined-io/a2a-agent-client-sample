# A2A Payments Agent Example

This example demonstrates how to use the Nevermined payments library with the Agent2Agent (A2A) protocol, including bearer token authentication handling.

## Features

- **Bearer Token Authentication**: The server automatically extracts bearer tokens from the `Authorization` header and injects them into the task context.
- **Credit Validation**: Before executing a task, it validates that the user has sufficient credits.
- **Credit Burning**: After successful execution, it burns the credits specified in the result.
- **Improved Error Handling**: Specific error messages for different HTTP status codes (401, 402, 403, 404).
- **Access Token Management**: Automatic access token retrieval using API keys.
- **Advanced Agent Capabilities**: Extended example with multiple AI operations and different credit costs.

## Project Structure

```
src/
├── agent.ts                    # Simple A2A agent (port 41242)
├── advanced-agent.ts           # Advanced A2A agent with multiple capabilities (port 41243)
├── client.ts                   # Client for simple agent
├── advanced-client.ts          # Client for advanced agent
├── test-bearer-token.ts        # Bearer token testing for simple agent
└── test-advanced-bearer-token.ts # Bearer token testing for advanced agent
```

## Quick Start

### Simple Agent (Basic Example)

1. **Start the simple agent**:
   ```bash
   npm run build
   node dist/agent.js
   ```

2. **Test with client**:
   ```bash
   node dist/client.js
   ```

3. **Test bearer token functionality**:
   ```bash
   node dist/test-bearer-token.js
   ```

### Advanced Agent (Extended Example)

1. **Start the advanced agent**:
   ```bash
   npm run build
   node dist/advanced-agent.js
   ```

2. **Test with advanced client**:
   ```bash
   node dist/advanced-client.js
   ```

3. **Test advanced bearer token functionality**:
   ```bash
   node dist/test-advanced-bearer-token.js
   ```

## Advanced Agent Capabilities

The advanced agent (`advanced-agent.ts`) demonstrates multiple AI capabilities with different credit costs:

| Operation | Credit Cost | Description |
|-----------|-------------|-------------|
| Greeting | 1 credit | Basic greetings and information |
| Calculation | 2 credits | Mathematical calculations |
| Weather | 3 credits | Weather information for locations |
| Translation | 4 credits | Language translations |
| Streaming | 5 credits | Streaming response demonstration |

### Example Advanced Agent Requests

```typescript
// Greeting (1 credit)
await sendAdvancedMessage(baseUrl, "Hello there!", accessToken);

// Calculation (2 credits)
await sendAdvancedMessage(baseUrl, "Calculate 15 * 7", accessToken);

// Weather (3 credits)
await sendAdvancedMessage(baseUrl, "Weather in London", accessToken);

// Translation (4 credits)
await sendAdvancedMessage(baseUrl, 'Translate "hello" to Spanish', accessToken);

// Streaming (5 credits)
await sendAdvancedMessage(baseUrl, "Start streaming", accessToken);
```

## Environment Setup

Create a `.env` file with the following variables:

```env
NVM_API_KEY=your_api_key_here
AGENT_ID=your_agent_id_here
PLAN_ID=your_plan_id_here
```

## How Access Tokens Work

### 1. Getting Access Tokens

To interact with the A2A agent, you need an access token. This is obtained using your API key:

```typescript
import { Payments } from "@nevermined-io/payments";

const paymentsService = Payments.getInstance({
  environment: "local",
  nvmApiKey: process.env.NVM_API_KEY,
});

// Get access token for the agent
const accessParams = await paymentsService.getAgentAccessToken(
  process.env.PLAN_ID!,
  process.env.AGENT_ID!
);

const accessToken = accessParams.accessToken;
```

### 2. Using Access Tokens

Once you have the access token, you can use it to authenticate requests:

```typescript
import { sendMessage } from './client'

// Send message with access token
await sendMessage('http://localhost:41242/', 'Hello agent!', accessToken)
```

## How Bearer Token Works

### 1. Extraction Middleware

The A2A server includes middleware that:

```typescript
function bearerTokenMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Extract bearer token from Authorization header
  const authHeader = req.headers.authorization
  let bearerToken: string | undefined

  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7) // Remove 'Bearer ' prefix
  }

  // Inject bearer token into request body metadata
  if (bearerToken && req.body && typeof req.body === 'object') {
    if (!req.body.metadata) {
      req.body.metadata = {}
    }
    req.body.metadata.bearerToken = bearerToken
    req.body.metadata.urlRequested = req.url
    req.body.metadata.httpMethodRequested = req.method
  }

  next()
}
```

### 2. Payments Adapter

The `PaymentsA2AAdapter` extracts the bearer token from the message metadata:

```typescript
async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
  const userMessage = requestContext.userMessage
  
  // Extract bearer token from message metadata
  const bearerToken = typeof userMessage.metadata?.bearerToken === 'string'
    ? userMessage.metadata.bearerToken
    : undefined
    
  // Use bearer token for credit validation
  const validation = await this.paymentsService.isValidRequest(
    taskId,
    bearerToken,
    urlRequested,
    httpMethodRequested,
  )
  
  // ... rest of logic
}
```

### 3. Handler Context

The user's executor receives the bearer token in the context:

```typescript
async handleTask(context: TaskContext): Promise<TaskHandlerResult> {
  const { bearerToken, userMessage } = context
  
  // Bearer token is available for use in business logic
  console.log('Bearer token:', bearerToken)
  
  return {
    parts: [{ kind: 'text', text: 'Agent response' }],
    metadata: { creditsUsed: 1 },
    state: 'completed'
  }
}
```

## Client Usage

### Simple Agent Client

```typescript
import { Payments } from "@nevermined-io/payments";
import { sendMessage } from './client'

// Get access token
const paymentsService = Payments.getInstance({
  environment: "local",
  nvmApiKey: process.env.NVM_API_KEY,
});
const accessParams = await paymentsService.getAgentAccessToken(
  process.env.PLAN_ID!,
  process.env.AGENT_ID!
);

// Send message with access token
await sendMessage('http://localhost:41242/', 'Hello agent!', accessParams.accessToken)
```

### Advanced Agent Client

```typescript
import { Payments } from "@nevermined-io/payments";
import { sendAdvancedMessage } from './advanced-client'

// Get access token
const paymentsService = Payments.getInstance({
  environment: "local",
  nvmApiKey: process.env.NVM_API_KEY,
});
const accessParams = await paymentsService.getAgentAccessToken(
  process.env.PLAN_ID!,
  process.env.AGENT_ID!
);

// Test various capabilities
await sendAdvancedMessage('http://localhost:41243/a2a', 'Hello there!', accessParams.accessToken);
await sendAdvancedMessage('http://localhost:41243/a2a', 'Calculate 15 * 7', accessParams.accessToken);
await sendAdvancedMessage('http://localhost:41243/a2a', 'Weather in London', accessParams.accessToken);
```

### Without Authentication

```typescript
import { sendMessage } from './client'

// Send message without bearer token
await sendMessage('http://localhost:41242/', 'Hello agent')
```

## Complete Flow

1. **Client gets access token**: Uses API key to call `getAgentAccessToken`
2. **Client sends request**: Includes access token in `Authorization` header
3. **Middleware extracts token**: Injects it into body metadata
4. **A2A SDK processes**: Creates message with included metadata
5. **Adapter validates credits**: Uses access token for validation
6. **Handler executes**: Receives access token in context
7. **Adapter burns credits**: After successful execution

## Error Handling

The system automatically handles authentication and credit errors with specific, user-friendly messages:

### Before (Generic Error)
```
ResultManager: Received status update for unknown task 398f53b1-d163-4d40-afdf-7cba6e4bc91
```

### After (Specific Error Messages)

- **401 Unauthorized**: `"Authentication failed. Please provide a valid access token."`
- **402 Payment Required**: `"Insufficient credits. Please purchase more credits to continue."`
- **403 Forbidden**: `"Access denied. You do not have permission to use this service."`
- **404 Not Found**: `"Service not found. Please check your configuration."`

### Testing Error Handling

Run the error handling test to see all scenarios:

```bash
# Simple agent error handling
npm run build
node dist/test-bearer-token.js

# Advanced agent error handling
node dist/test-advanced-bearer-token.js
```

This will demonstrate how the improved error messages help users understand exactly what they need to fix.

## Server Configuration

### Simple Agent (Port 41242)

```typescript
// agent.ts
const serverConfig = {
  port: 41242,
  agentId: process.env.AGENT_ID || "demo-agent-id",
  planId: process.env.PLAN_ID || "demo-plan",
};
```

### Advanced Agent (Port 41243)

```typescript
// advanced-agent.ts
const serverConfig = {
  port: 41243, // Different port to avoid conflicts
  agentId: process.env.AGENT_ID || "advanced-agent-id",
  planId: process.env.PLAN_ID || "advanced-plan",
};
```

## Testing Scenarios

### Simple Agent Testing

1. **Basic functionality**: `node dist/client.js`
2. **Bearer token flow**: `node dist/test-bearer-token.js`
3. **Error handling**: Various invalid token scenarios

### Advanced Agent Testing

1. **All capabilities**: `node dist/advanced-client.js`
2. **Bearer token with capabilities**: `node dist/test-advanced-bearer-token.js`
3. **Mixed scenarios**: Valid/invalid token combinations
4. **Credit cost validation**: Different operations with different costs

## Development

### Building

```bash
npm run build
```

### Running Tests

```bash
# Simple agent tests
node dist/test-bearer-token.js

# Advanced agent tests
node dist/test-advanced-bearer-token.js
```

### Running Servers

```bash
# Simple agent server
node dist/agent.js

# Advanced agent server (in another terminal)
node dist/advanced-agent.js
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 41242 and 41243 are available
2. **Environment variables**: Ensure all required env vars are set
3. **API key permissions**: Verify your API key has the necessary permissions
4. **Network connectivity**: Check that the agent servers are accessible

### Debug Information

Both agents provide debug information:

```bash
[DEBUG] Agent ID from config: your-agent-id
[DEBUG] AgentCard payment extension: { ... }
```

### Logs

- Simple agent: `[A2A]` prefix
- Advanced agent: `[ADVANCED-A2A]` prefix
- Clients: `[Client]` and `[Advanced Client]` prefixes 