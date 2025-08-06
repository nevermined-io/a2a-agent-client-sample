/**
 * A2A agent using the payments library with extended functionality.
 * Demonstrates various AI capabilities with different credit costs per operation.
 */

// ============================================================================
// ENVIRONMENT SETUP
// ============================================================================

import "dotenv/config";

// ============================================================================
// IMPORTS
// ============================================================================

import {
  Payments,
  PlanCreditsType,
  PlanPriceType,
  PlanRedemptionType,
} from "@nevermined-io/payments";
import type {
  AgentCard,
  TaskHandlerResult,
  TaskStatusUpdateEvent,
  ExecutionEventBus,
  AgentExecutor,
  RequestContext,
  AgentMetadata,
  AgentAPIAttributes,
  PlanMetadata,
  PlanPriceConfig,
  PlanCreditsConfig,
} from "@nevermined-io/payments";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// CONFIGURATION
// ============================================================================
const ZeroAddress = "0x0000000000000000000000000000000000000000";

/**
 * Configuration for the payments service.
 */
const paymentsConfig = {
  environment: "staging_sandbox" as const,
  nvmApiKey:
    process.env.PUBLISHER_API_KEY ||
    "eyJhbGciOiJFUzI1NksifQ.eyJpc3MiOiIweDU4MzhCNTUxMmNGOWYxMkZFOWYyYmVjY0IyMGViNDcyMTFGOUIwYmMiLCJzdWIiOiIweGU4QjYwMDA0ODZBMzk3MjY3N0IwNWE1NTY2OTM2QjJGOTVBMjUzZTgiLCJqdGkiOiIweDA2MjRlNThhOWJkMDAzNjI0MTJiNDQzNDg2NWQ5YzJiM2E3OWNjNmM2YTcxODU4YTM5MjE5YmM1NjUyMTgyOWIiLCJleHAiOjE3ODYwNTI3Mzh9.bkhGv9ZLDo4gL75NKlrMu9OtTnhaqWLF3XwkxGsHdKUhcG11iYl1Oe5jqbA5D73fdHrm73iYSbOUkrKQP-qyPBw",
};

/**
 * Configuration for the A2A server.
 */
const serverConfig = {
  port: 41243, // Different port to avoid conflicts
  agentId:
    process.env.AGENT_ID ||
    "did:nv:8f87ac874094cc115935b399082479119e68c542c0f40167859577f34a1bbb53",
  planId:
    process.env.PLAN_ID ||
    "38903382680661089761144463553411737235237456544456064481459352422894111390695",
  token_address: (process.env.TOKEN_ADDRESS ||
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
};

// ============================================================================
// AGENT AND PLAN CONFIGURATION
// ============================================================================

/**
 * Configuration for the agent metadata.
 */
const agentMetadata: AgentMetadata = {
  name: "AI Assistant with Payments",
  description:
    "An AI assistant with multiple capabilities including calculations, weather, translations, and more. Each operation has different credit costs based on complexity.",
  tags: ["ai", "assistant", "payments", "a2a"],
  dateCreated: new Date(),
};

/**
 * Configuration for the agent API attributes.
 */
const agentApi: AgentAPIAttributes = {
  endpoints: [{ POST: `http://localhost:${serverConfig.port}/a2a` }],
  openEndpoints: [
    `http://localhost:${serverConfig.port}/a2a/.well-known/agent.json`,
  ],
  authType: "none",
};

/**
 * Configuration for the plan metadata.
 */
const planMetadata: PlanMetadata = {
  name: "AI Assistant Credits Plan",
  description:
    "Plan for accessing the AI Assistant with dynamic credit costs based on operation complexity",
  tags: ["ai", "assistant", "credits"],
  isTrialPlan: false,
};

/**
 * Price config for the plan
 */
const priceConfig: PlanPriceConfig = {
  priceType: PlanPriceType.FIXED_PRICE,
  tokenAddress: serverConfig.token_address,
  amounts: [10000n], //10000 wei: 0.01 USDC for testing
  receivers: [],
  contractAddress: ZeroAddress,
  feeController: ZeroAddress,
};

/**
 * Credits config for the plan
 */
const creditsConfig: PlanCreditsConfig = {
  creditsType: PlanCreditsType.DYNAMIC,
  redemptionType: PlanRedemptionType.ONLY_OWNER,
  proofRequired: false,
  durationSecs: 0n,
  amount: 1000n,
  minAmount: 1n,
  maxAmount: 100n,
};

// ============================================================================
// AGENT CARD DEFINITION
// ============================================================================

/**
 *  AgentCard definition for the agent with multiple capabilities.
 */
const baseAgentCard: AgentCard = {
  name: "AI Assistant",
  description:
    "An AI assistant with multiple capabilities including calculations, weather, translations, and more. Each operation has different credit costs based on complexity.",
  url: "http://localhost:41243/a2a/",
  provider: {
    organization: "Nevermined",
    url: "https://nevermined.io",
  },
  version: "2.0.0",
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  securitySchemes: undefined,
  security: undefined,
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "greeting",
      name: "Greeting",
      description:
        "Responds to greetings and provides information about capabilities.",
      tags: ["greeting", "info"],
      examples: ["Hello", "Hi", "What can you do?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
    {
      id: "calculation",
      name: "Mathematical Calculations",
      description: "Performs mathematical calculations and operations.",
      tags: ["math", "calculation"],
      examples: ["Calculate 2+2", "What is 15 * 7?", "Math: 100/4"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
    {
      id: "weather",
      name: "Weather Information",
      description: "Provides weather information for specified locations.",
      tags: ["weather", "location"],
      examples: ["Weather in London", "What's the weather in Tokyo?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
    {
      id: "translation",
      name: "Language Translation",
      description: "Translates text between different languages.",
      tags: ["translation", "language"],
      examples: [
        "Translate 'hello' to Spanish",
        "How do you say 'goodbye' in French?",
      ],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
    {
      id: "streaming",
      name: "Streaming Response",
      description:
        "Demonstrates streaming response capability. Use the message/stream method to receive real-time updates via SSE.",
      tags: ["streaming", "demo"],
      examples: ["Start streaming", "Show me a stream"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
  supportsAuthenticatedExtendedCard: false,
};

/**
 * Build the AgentCard with payment information using the A2A extension.
 */
const agentCard = Payments.a2a.buildPaymentAgentCard(baseAgentCard, {
  paymentType: "dynamic",
  credits: 1, // Base cost
  costDescription:
    "Variable credits based on operation complexity: Greeting (1), Calculation (2), Weather (3), Translation (4), Streaming (5)",
  planId: serverConfig.planId,
  agentId: serverConfig.agentId,
});

// Debug: Log the agentCard to verify agentId is included
console.log("[DEBUG] Agent ID from config:", serverConfig.agentId);
console.log(
  "[DEBUG] AgentCard payment extension:",
  agentCard.capabilities?.extensions?.find(
    (ext) => ext.uri === "urn:nevermined:payment"
  )
);

// ============================================================================
// AGENT EXECUTOR
// ============================================================================

/**
 * Executor that handles multiple types of AI tasks with different credit costs.
 */
class Executor implements AgentExecutor {
  /**
   * Handles an incoming task request and routes to the appropriate handler.
   * @param context - The request context containing the user message and metadata.
   * @param eventBus - The event bus for publishing events.
   * @returns An object with the TaskHandlerResult and a boolean indicating if more updates are expected.
   */
  async handleTask(
    context: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<{ result: TaskHandlerResult; expectsMoreUpdates: boolean }> {
    const firstPart = context.userMessage.parts[0];
    const userText =
      firstPart && firstPart.kind === "text" ? firstPart.text : "";

    console.log(`[A2A] Received message: ${userText}`);

    try {
      // Route to appropriate handler based on content
      if (this.isGreeting(userText)) {
        return {
          result: await this.handleGreeting(userText),
          expectsMoreUpdates: false,
        };
      } else if (this.isCalculation(userText)) {
        return {
          result: await this.handleCalculation(userText),
          expectsMoreUpdates: false,
        };
      } else if (this.isWeatherRequest(userText)) {
        return {
          result: await this.handleWeatherRequest(userText),
          expectsMoreUpdates: false,
        };
      } else if (this.isTranslationRequest(userText)) {
        return {
          result: await this.handleTranslationRequest(userText),
          expectsMoreUpdates: false,
        };
      } else if (this.isStreamingRequest(userText)) {
        return {
          result: await this.handleStreamingRequest(
            userText,
            context,
            eventBus
          ),
          expectsMoreUpdates: false,
        };
      } else if (this.isPushNotificationRequest(userText)) {
        return {
          result: await this.handlePushNotificationRequest(
            userText,
            context,
            eventBus
          ),
          expectsMoreUpdates: true,
        };
      } else {
        return {
          result: await this.handleGeneralRequest(userText),
          expectsMoreUpdates: false,
        };
      }
    } catch (error) {
      console.error("[A2A] Error processing request:", error);
      return {
        result: {
          parts: [
            {
              kind: "text",
              text: `Error: ${
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred"
              }`,
            },
          ],
          metadata: {
            creditsUsed: 1,
            planId: serverConfig.planId,
            errorType: "processing_error",
          },
          state: "failed",
        },
        expectsMoreUpdates: false,
      };
    }
  }

  /**
   * Handles task cancellation.
   * @param taskId - The ID of the task to cancel.
   * @returns A promise that resolves when cancellation is complete.
   */
  async cancelTask(taskId: string): Promise<void> {
    console.log(`[A2A] Cancelling task: ${taskId}`);
  }

  // ============================================================================
  // CONTENT DETECTION METHODS
  // ============================================================================

  /**
   * Detects if the message is a greeting.
   */
  private isGreeting(text: string): boolean {
    const greetings = [
      "hello",
      "hi",
      "hey",
      "good morning",
      "good afternoon",
      "good evening",
    ];
    return greetings.some((greeting) => text.toLowerCase().includes(greeting));
  }

  /**
   * Detects if the message is a calculation request.
   */
  private isCalculation(text: string): boolean {
    const mathKeywords = [
      "calculate",
      "math",
      "compute",
      "solve",
      "what is",
      "=",
    ];
    const hasMathKeywords = mathKeywords.some((keyword) =>
      text.toLowerCase().includes(keyword)
    );
    const hasNumbers = /\d/.test(text);
    const hasOperators = /[+\-*/()]/.test(text);
    return hasMathKeywords || (hasNumbers && hasOperators);
  }

  /**
   * Detects if the message is a weather request.
   */
  private isWeatherRequest(text: string): boolean {
    return text.toLowerCase().includes("weather");
  }

  /**
   * Detects if the message is a translation request.
   */
  private isTranslationRequest(text: string): boolean {
    const translationKeywords = [
      "translate",
      "translation",
      "say in",
      "how do you say",
    ];
    return translationKeywords.some((keyword) =>
      text.toLowerCase().includes(keyword)
    );
  }

  /**
   * Detects if the message is a streaming request.
   */
  private isStreamingRequest(text: string): boolean {
    return text.toLowerCase().includes("stream");
  }

  /**
   * Detects if the message is a push notification request.
   */
  private isPushNotificationRequest(text: string): boolean {
    return text.toLowerCase().includes("push notification");
  }

  // ============================================================================
  // TASK HANDLERS
  // ============================================================================

  /**
   * Handles greeting requests.
   */
  private handleGreeting(userText: string): TaskHandlerResult {
    const greeting = this.isGreeting(userText) ? userText : "Hello";

    return {
      parts: [
        {
          kind: "text",
          text:
            `${greeting}! I'm your AI assistant with payment integration. I can help you with:\n` +
            `• Greetings and information (1 credit)\n` +
            `• Mathematical calculations (2 credits)\n` +
            `• Weather information (3 credits)\n` +
            `• Language translations (4 credits)\n` +
            `• Streaming responses (5 credits)\n\n` +
            `Just ask me anything!`,
        },
      ],
      metadata: {
        creditsUsed: 1,
        planId: serverConfig.planId,
        costDescription: "Basic greeting response",
        operationType: "greeting",
      },
      state: "completed",
    };
  }

  /**
   * Handles calculation requests.
   */
  private handleCalculation(userText: string): TaskHandlerResult {
    // Extract mathematical expression
    const expression = userText
      .replace(/.*?(calculate|math|compute|solve|what is)\s+/i, "")
      .replace(/[^0-9+\-*/().]/g, "");

    if (!expression) {
      return {
        parts: [
          {
            kind: "text",
            text: "Error: Please provide a valid mathematical expression",
          },
        ],
        metadata: {
          creditsUsed: 1,
          planId: serverConfig.planId,
          operationType: "calculation_error",
        },
        state: "failed",
      };
    }

    try {
      const result = eval(expression);

      return {
        parts: [
          {
            kind: "text",
            text: `📊 Calculation Result:\n${expression} = ${result}`,
          },
        ],
        metadata: {
          creditsUsed: 2, // Calculations cost more
          planId: serverConfig.planId,
          costDescription: "Mathematical calculation",
          operationType: "calculation",
          expression,
          result,
        },
        state: "completed",
      };
    } catch (error) {
      return {
        parts: [
          {
            kind: "text",
            text: "Error: Invalid mathematical expression",
          },
        ],
        metadata: {
          creditsUsed: 1,
          planId: serverConfig.planId,
          expression,
          operationType: "calculation_error",
        },
        state: "failed",
      };
    }
  }

  /**
   * Handles weather requests.
   */
  private handleWeatherRequest(userText: string): TaskHandlerResult {
    // Extract location from request
    const location = userText.replace(/.*?weather\s+(?:in\s+)?/i, "").trim();

    if (!location) {
      return {
        parts: [
          {
            kind: "text",
            text: "Error: Please specify a location for weather information",
          },
        ],
        metadata: {
          creditsUsed: 1,
          planId: serverConfig.planId,
          operationType: "weather_error",
        },
        state: "failed",
      };
    }

    // Simulate weather API call
    const weatherData = this.simulateWeatherAPI(location);

    return {
      parts: [
        {
          kind: "text",
          text: `🌤️ Weather in ${location}:\n${weatherData.description}, ${weatherData.temperature}°C\nHumidity: ${weatherData.humidity}%\nWind: ${weatherData.windSpeed} km/h`,
        },
      ],
      metadata: {
        creditsUsed: 3, // Weather requests cost more due to API calls
        planId: serverConfig.planId,
        costDescription: "Weather information request",
        operationType: "weather",
        location,
        weatherData,
      },
      state: "completed",
    };
  }

  /**
   * Handles translation requests.
   */
  private handleTranslationRequest(userText: string): TaskHandlerResult {
    // Extract text and target language
    const translationMatch = userText.match(
      /translate\s+['"]([^'"]+)['"]\s+to\s+(\w+)/i
    );

    if (!translationMatch) {
      return {
        parts: [
          {
            kind: "text",
            text: "Error: Please use format: 'translate \"text\" to language'",
          },
        ],
        metadata: {
          creditsUsed: 1,
          planId: serverConfig.planId,
          operationType: "translation_error",
        },
        state: "failed",
      };
    }

    const [, text, targetLanguage] = translationMatch;
    const translation = this.simulateTranslation(text, targetLanguage);

    return {
      parts: [
        {
          kind: "text",
          text: `🌍 Translation:\n"${text}" → "${translation}" (${targetLanguage})`,
        },
      ],
      metadata: {
        creditsUsed: 4, // Translations cost more
        planId: serverConfig.planId,
        costDescription: "Language translation",
        operationType: "translation",
        originalText: text,
        targetLanguage,
        translatedText: translation,
      },
      state: "completed",
    };
  }

  /**
   * Handles streaming requests by publishing streaming events to the eventBus.
   * @param userText - The user message text.
   * @param context - The task context, including user message and metadata.
   * @param eventBus - (Optional) The event bus to publish streaming events.
   * @returns The final TaskHandlerResult.
   */
  private async handleStreamingRequest(
    userText: string,
    context: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<TaskHandlerResult> {
    // Emit streaming messages every second for 60 seconds
    const totalMessages = 10;
    const delayMs = 1000;
    const taskId = context?.taskId;
    const contextId = context?.contextId;

    for (let i = 1; i <= totalMessages; i++) {
      // Publish a status-update event for each streaming message
      eventBus.publish({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuidv4(),
            parts: [
              {
                kind: "text",
                text: `Streaming message ${i}/${totalMessages}`,
              },
            ],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: false,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Publish final streaming message
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "working",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [
            {
              kind: "text",
              text: "Streaming finished!",
            },
          ],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    });

    return {
      parts: [
        {
          kind: "text",
          text: `🚀 Streaming started! You will receive 60 messages via SSE (one per second).\nCheck your /message/stream subscription.`,
        },
      ],
      metadata: {
        creditsUsed: 5, // Streaming costs more
        planId: serverConfig.planId,
        costDescription: "Streaming response",
        operationType: "streaming",
        streamingType: "text",
      },
      state: "completed",
    };
  }

  /**
   * Handles push notification requests.
   * Publishes an intermediate state and launches an async background task
   * that will publish the final state when the background work is done.
   * @param userText - The user message text.
   * @param context - The task context, including user message and metadata.
   * @param eventBus - The event bus to publish streaming events.
   * @returns The initial TaskHandlerResult (intermediate state).
   */
  private async handlePushNotificationRequest(
    userText: string,
    context: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<TaskHandlerResult> {
    const taskId = context?.taskId;
    const contextId = context?.contextId;

    // Publish intermediate state ("working")
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "working",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [
            {
              kind: "text",
              text: "Push notification request received. Waiting for pushNotificationConfig...",
            },
          ],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    });

    // Launch background async task for finalization
    this.finalizePushNotificationTask(taskId, contextId, eventBus);

    // Return immediately with the intermediate state
    return {
      parts: [
        {
          kind: "text",
          text: "Push notification request received. Waiting for pushNotificationConfig...",
        },
      ],
      state: "working",
    };
  }

  /**
   * Background async function that simulates waiting for pushNotificationConfig
   * and then publishes the final state for the push notification task.
   * This function is launched in the background and does not block the handler.
   * @param taskId - The task ID.
   * @param contextId - The context ID.
   * @param eventBus - The event bus to publish status updates.
   */
  private async finalizePushNotificationTask(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus
  ) {
    // Simulate waiting for pushNotificationConfig to be set (replace with real logic if needed)
    await this.simulateWaitForPushConfig();

    // Publish final state ("completed")
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "completed",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [
            {
              kind: "text",
              text: "Push notification task completed!",
            },
          ],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: true,
      metadata: {
        completed: true,
        creditsUsed: 5,
        planId: serverConfig.planId,
        costDescription: "Push notification task completed",
        operationType: "push_notification",
      },
    });
    eventBus.finished();
  }

  /**
   * Simulates waiting for the push notification config to be set.
   * Replace this with real logic to check for the config if needed.
   * @returns A promise that resolves after a delay.
   */
  private async simulateWaitForPushConfig(): Promise<void> {
    // Simulate a delay (e.g., waiting for the client to set the config)
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }

  /**
   * Handles general requests.
   */
  private handleGeneralRequest(userText: string): TaskHandlerResult {
    return {
      parts: [
        {
          kind: "text",
          text:
            `🤖 I received your request: "${userText}"\n\n` +
            `I'm an AI assistant with payment integration. Each operation costs different credits:\n` +
            `• Greetings: 1 credit\n` +
            `• Calculations: 2 credits\n` +
            `• Weather: 3 credits\n` +
            `• Translations: 4 credits\n` +
            `• Streaming: 5 credits\n\n` +
            `Try asking me to calculate something, get weather info, or translate text!`,
        },
      ],
      metadata: {
        creditsUsed: 1,
        planId: serverConfig.planId,
        costDescription: "General request processing",
        operationType: "general",
      },
      state: "completed",
    };
  }

  // ============================================================================
  // SIMULATION METHODS
  // ============================================================================

  /**
   * Simulates a weather API call.
   */
  private simulateWeatherAPI(location: string) {
    // In a real implementation, this would call an actual weather API
    const conditions = [
      "Sunny",
      "Cloudy",
      "Rainy",
      "Snowy",
      "Windy",
      "Partly Cloudy",
    ];
    const randomCondition =
      conditions[Math.floor(Math.random() * conditions.length)];
    const randomTemp = Math.floor(Math.random() * 30) + 5; // 5-35°C
    const randomHumidity = Math.floor(Math.random() * 40) + 30; // 30-70%
    const randomWind = Math.floor(Math.random() * 20) + 5; // 5-25 km/h

    return {
      location,
      description: randomCondition,
      temperature: randomTemp,
      humidity: randomHumidity,
      windSpeed: randomWind,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Simulates a translation API call.
   */
  private simulateTranslation(text: string, targetLanguage: string): string {
    // Simple translation simulation
    const translations: Record<string, Record<string, string>> = {
      spanish: {
        hello: "hola",
        goodbye: "adiós",
        "thank you": "gracias",
        "good morning": "buenos días",
        "how are you": "¿cómo estás?",
      },
      french: {
        hello: "bonjour",
        goodbye: "au revoir",
        "thank you": "merci",
        "good morning": "bonjour",
        "how are you": "comment allez-vous?",
      },
      german: {
        hello: "hallo",
        goodbye: "auf wiedersehen",
        "thank you": "danke",
        "good morning": "guten morgen",
        "how are you": "wie geht es dir?",
      },
    };

    const lang = targetLanguage.toLowerCase();
    const lowerText = text.toLowerCase();

    if (translations[lang] && translations[lang][lowerText]) {
      return translations[lang][lowerText];
    }

    // Fallback: add language suffix
    return `${text} (${targetLanguage})`;
  }

  /**
   * Entrypoint required by the A2A SDK. Publishes the result of handleTask as a final status-update event.
   * @param requestContext - The task context.
   * @param eventBus - The event bus to publish events.
   */
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    // Build the final status-update event
    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;
    const userMessage = requestContext.userMessage;

    try {
      let task = requestContext.task;
      if (!task) {
        task = {
          kind: "task",
          id: taskId,
          contextId,
          status: {
            state: "submitted",
            timestamp: new Date().toISOString(),
          },
          artifacts: [],
          history: [userMessage], // Start history with the current user message
          metadata: userMessage.metadata, // Carry over metadata from message if any
        };
      }
      eventBus.publish(task);

      // Call the business logic handler
      const { result, expectsMoreUpdates } = await this.handleTask(
        requestContext,
        eventBus
      );

      if (expectsMoreUpdates) {
        return;
      }

      // Otherwise, publish the final status-update event as usual
      const finalUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: result.state || "completed",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuidv4(),
            parts: result.parts,
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
        metadata: result.metadata,
      };
      eventBus.publish(finalUpdate);
      eventBus.finished();
    } catch (error) {
      const errorUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "failed",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuidv4(),
            parts: [
              {
                kind: "text",
                text: `Agent error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
        metadata: { errorType: "agent_error" },
      };
      eventBus.publish(errorUpdate);
      eventBus.finished();
    }
  }
}

// ============================================================================
// AGENT AND PLAN SETUP FUNCTIONS
// ============================================================================

/**
 * Checks if an agent exists and returns its information.
 * @param paymentsService - The payments service instance.
 * @param agentId - The agent ID to check.
 * @returns The agent information if it exists, null otherwise.
 */
async function checkAgentExists(
  paymentsService: any,
  agentId: string
): Promise<any> {
  try {
    const agent = await paymentsService.agents.getAgent(agentId);
    console.log(`✅ Agent found: ${agentId}`);
    return agent;
  } catch (error) {
    console.log(`❌ Agent not found: ${agentId}`);
    return null;
  }
}

/**
 * Checks if a plan exists and returns its information.
 * @param paymentsService - The payments service instance.
 * @param planId - The plan ID to check.
 * @returns The plan information if it exists, null otherwise.
 */
async function checkPlanExists(
  paymentsService: any,
  planId: string
): Promise<any> {
  try {
    const plan = await paymentsService.plans.getPlan(planId);
    console.log(`✅ Plan found: ${planId}`);
    return plan;
  } catch (error) {
    console.log(`❌ Plan not found: ${planId}`);
    return null;
  }
}

/**
 * Creates a new agent and plan if they don't exist.
 * @param paymentsService - The payments service instance.
 * @returns An object containing the agentId and planId.
 */
async function setupAgentAndPlan(paymentsService: any): Promise<{
  agentId: string;
  planId: string;
}> {
  console.log("🔧 Setting up agent and plan...");

  // Check if agent and plan already exist
  const existingAgent = await checkAgentExists(
    paymentsService,
    serverConfig.agentId
  );
  const existingPlan = await checkPlanExists(
    paymentsService,
    serverConfig.planId
  );

  if (existingAgent && existingPlan) {
    console.log(
      "✅ Agent and plan already exist, using existing configuration"
    );
    return {
      agentId: serverConfig.agentId,
      planId: serverConfig.planId,
    };
  }

  // If either doesn't exist, create both
  console.log("🆕 Creating new agent and plan...");

  priceConfig.receivers = [paymentsService.getAccountAddress()];

  try {
    const result = await paymentsService.agents.registerAgentAndPlan(
      agentMetadata,
      agentApi,
      planMetadata,
      priceConfig,
      creditsConfig
    );

    console.log(`✅ Agent and plan created successfully!`);
    console.log(`   Agent ID: ${result.agentId}`);
    console.log(`   Plan ID: ${result.planId}`);
    console.log(`   Transaction Hash: ${result.txHash}`);

    return {
      agentId: result.agentId,
      planId: result.planId,
    };
  } catch (error) {
    console.error("❌ Error creating agent and plan:", error);
    throw error;
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main function that sets up the agent and plan, then starts the A2A server.
 */
async function main() {
  try {
    console.log("🚀 Starting A2A Payments Agent setup...");

    // Initialize the payments service
    const paymentsService = Payments.getInstance(paymentsConfig);

    // Setup agent and plan
    const { agentId, planId } = await setupAgentAndPlan(paymentsService);

    // Update server config with the actual IDs
    serverConfig.agentId = agentId;
    serverConfig.planId = planId;

    // Update agent card with the actual IDs
    const updatedAgentCard = Payments.a2a.buildPaymentAgentCard(baseAgentCard, {
      paymentType: "dynamic",
      credits: 1, // Base cost
      costDescription:
        "Variable credits based on operation complexity: Greeting (1), Calculation (2), Weather (3), Translation (4), Streaming (5)",
      planId: serverConfig.planId,
      agentId: serverConfig.agentId,
    });

    // Start the A2A server
    console.log("🌐 Starting A2A server...");
    paymentsService.a2a.start({
      agentCard: updatedAgentCard,
      executor: new Executor(),
      port: serverConfig.port,
      basePath: "/a2a/",
    });

    console.log("🚀 A2A Payments Agent started successfully!");
    console.log(
      `📍 Server running on: http://localhost:${serverConfig.port}/a2a/`
    );
    console.log(
      `📋 Agent Card: http://localhost:${serverConfig.port}/a2a/.well-known/agent.json`
    );
    console.log("");
    console.log("🧪 Test with these examples:");
    console.log("- Hello (1 credit)");
    console.log("- Calculate 15 * 7 (2 credits)");
    console.log("- Weather in London (3 credits)");
    console.log('- Translate "hello" to Spanish (4 credits)');
    console.log("- Start streaming (5 credits)");
    console.log("");
    console.log("Press Ctrl+C to stop the server");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down A2A Payments Agent...");
      console.log("✅ Server stopped");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Error in main function:", error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error("❌ Failed to start application:", error);
  process.exit(1);
});
