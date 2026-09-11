const axios = require('axios');
const { createGeminiChatProvider } = require('../../../src/services/chat-provider');

describe('Gemini native tool model configuration', () => {
  afterEach(() => jest.restoreAllMocks());

  test('applies an optional thinking budget and returns safe usage metadata', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ functionCall: { name: 'get_my_steps', args: {} } }] }
        }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 10,
          thoughtsTokenCount: 20,
          totalTokenCount: 130
        }
      }
    });
    const provider = createGeminiChatProvider({
      enabled: true,
      apiKey: 'test-key',
      model: 'gemini-test',
      requirePrivacyAcknowledgement: false,
      toolMaxOutputTokens: 1200,
      toolThinkingBudget: 128
    });
    const model = provider.createToolModel({ currentDate: '2026-09-12', challenge: null });

    const result = await model.generate({
      message: 'show my steps', history: [], tone: 'neutral', observations: [],
      allowTools: true, tools: [{ name: 'get_my_steps', parameters: { type: 'object', properties: {} } }]
    });

    expect(post.mock.calls[0][1].generationConfig).toEqual({
      temperature: 0.1,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingBudget: 128 }
    });
    expect(result).toMatchObject({
      functionCalls: [{ name: 'get_my_steps', args: {} }],
      metadata: {
        finish_reason: 'STOP', prompt_tokens: 100, response_tokens: 10,
        thought_tokens: 20, total_tokens: 130
      }
    });
  });

  test('leaves model-managed thinking enabled when no budget is configured', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Hello' }] } }] }
    });
    const provider = createGeminiChatProvider({
      enabled: true, apiKey: 'test-key', model: 'gemini-test',
      requirePrivacyAcknowledgement: false
    });
    await provider.createToolModel({ currentDate: '2026-09-12', challenge: null }).generate({
      message: 'hello', history: [], tone: 'neutral', observations: [], allowTools: false, tools: []
    });
    expect(post.mock.calls[0][1].generationConfig).not.toHaveProperty('thinkingConfig');
  });
});
