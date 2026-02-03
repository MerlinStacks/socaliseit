---
name: ai-agent-patterns
description: Master AI agent development with on-device LLMs, MCP integration, and multimodal flows. Use when building AI features, integrating LLMs, or implementing agent orchestration.
---

# AI Agent Patterns

Expert guide for building AI-powered applications with LLMs, tool calling, and orchestration.

## When to Use This Skill

- Integrating LLMs into applications
- Building tool-calling agents
- Implementing MCP servers/clients
- Creating multimodal AI features
- Managing conversation context

## LLM Integration

```typescript
// lib/ai/client.ts
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function generateResponse(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: openai('gpt-4-turbo'),
    prompt,
    maxTokens: 1000,
  });
  return text;
}

export async function streamResponse(
  prompt: string,
  onChunk: (text: string) => void
): Promise<void> {
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    prompt,
  });

  for await (const chunk of result.textStream) {
    onChunk(chunk);
  }
}
```

## Tool Calling

```typescript
// lib/ai/tools.ts
import { tool } from 'ai';
import { z } from 'zod';

export const weatherTool = tool({
  description: 'Get current weather for a location',
  parameters: z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  execute: async ({ location, unit }) => {
    const data = await fetchWeather(location);
    return { temperature: data.temp, unit, conditions: data.conditions };
  },
});

export const searchTool = tool({
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }) => {
    const results = await webSearch(query);
    return results.slice(0, 3);
  },
});

// Usage with agent
const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: { weather: weatherTool, search: searchTool },
  prompt: 'What is the weather in Tokyo?',
  maxToolRoundtrips: 3,
});
```

## Conversation Memory

```typescript
// lib/ai/memory.ts
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

class ConversationMemory {
  private messages: Message[] = [];
  private maxMessages = 20;

  add(message: Message): void {
    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      // Keep system message + recent messages
      const system = this.messages.find((m) => m.role === 'system');
      this.messages = system
        ? [system, ...this.messages.slice(-this.maxMessages + 1)]
        : this.messages.slice(-this.maxMessages);
    }
  }

  getContext(): Message[] {
    return [...this.messages];
  }

  summarize(): string {
    return this.messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  }

  clear(): void {
    this.messages = [];
  }
}
```

## MCP Server Implementation

```typescript
// mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

const server = new Server({
  name: 'my-mcp-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {},
  },
});

// Register a tool
server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'get_data',
    description: 'Fetch data from the database',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  }],
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'get_data') {
    const data = await fetchFromDB(request.params.arguments.id);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Streaming UI

```tsx
// components/chat.tsx
'use client';
import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id} className={m.role === 'user' ? 'user' : 'assistant'}>
          {m.content}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="Type a message..."
        />
      </form>
    </div>
  );
}
```

## Error Handling

```typescript
// lib/ai/resilience.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on auth or validation errors
      if (error.status === 401 || error.status === 400) throw error;
      
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  
  throw lastError;
}

export function handleAIError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('rate limit')) {
      return 'Too many requests. Please wait a moment.';
    }
    if (error.message.includes('context length')) {
      return 'Message too long. Please shorten your input.';
    }
  }
  return 'An error occurred. Please try again.';
}
```

## Best Practices

1. **Stream responses** - Better UX for long generations
2. **Implement fallbacks** - Handle model failures gracefully
3. **Limit context** - Manage token usage with summarization
4. **Validate tool outputs** - Don't trust LLM-generated data
5. **Log interactions** - Debug and improve prompts
6. **Rate limit users** - Prevent abuse and control costs
