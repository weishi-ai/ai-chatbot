import { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1Prompt, LanguageModelV1StreamPart } from "ai";

// Doubao 模型实现 - 支持多模态内容（文本和图片）
function convertPromptToMessages(prompt: LanguageModelV1Prompt): Array<{role: string, content: any}> {
  return prompt.map((message) => {
    if (message.role === 'user' || message.role === 'assistant') {
      // 检查是否包含图片内容
      const hasImage = message.content.some(content => content.type === 'image');
      
      if (hasImage) {
        // 如果包含图片，使用多模态格式
        const content = message.content.map((content) => {
          if (content.type === 'text') {
            return {
              type: 'text',
              text: content.text
            };
          } else if (content.type === 'image') {
            return {
              type: 'image_url',
              image_url: { url: content.image }
            };
          }
          return null;
        }).filter(item => item !== null);
        
        return { role: message.role, content };
      } else {
        // 纯文本内容，保持原有格式
        const textContent = message.content
          .map((content) => {
            if (content.type === 'text') {
              return content.text;
            }
            return '';
          })
          .filter(text => text.trim() !== '')
          .join(' ');
        return { role: message.role, content: textContent };
      }
    } else if (message.role === 'system') {
      return { role: 'system', content: message.content };
    }
    return { role: 'user', content: '' };
  }).filter(msg => {
    if (typeof msg.content === 'string') {
      return msg.content.trim() !== '';
    }
    return Array.isArray(msg.content) && msg.content.length > 0;
  });
}

export const doubaoModel: LanguageModelV1 = {
  specificationVersion: 'v1',
  provider: 'doubao',
  modelId: 'doubao-1.5-vision-pro-250328',
  defaultObjectGenerationMode: 'json',

  async doGenerate(options: LanguageModelV1CallOptions) {
    const { prompt } = options;
    
    // 调试：输出原始prompt结构
    // console.log('Doubao 原始prompt:', JSON.stringify(prompt, null, 2));
    
    const messages = convertPromptToMessages(prompt);

    // 调试：输出转换后的消息格式
    // console.log('Doubao 转换后的消息:', JSON.stringify(messages, null, 2));

    const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const apiKey = process.env.DOUBAO_API_KEY || 'ade655b0-cce1-4d70-9863-89b03adac124';
    
    try {
      const response = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'doubao-1.5-vision-pro-250328',
          messages: messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      // console.log(text,'---doubao---title----')
      return {
        text,
        rawCall: {
          rawPrompt: prompt,
          rawSettings: {},
        },
        rawResponse: {
          headers: {},
        },
        request: {
          body: JSON.stringify({
            model: 'doubao-1.5-vision-pro-250328',
            messages: messages,
            stream: false
          }),
        },
        warnings: [],
        finishReason: 'stop',
        usage: { 
          promptTokens: data.usage?.prompt_tokens || 0, 
          completionTokens: data.usage?.completion_tokens || 0 
        }
      };
    } catch (error) {
      console.error('Doubao API error details:', error);
      throw new Error(`Doubao API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async doStream(options: LanguageModelV1CallOptions) {
    const { prompt } = options;
    
    // 调试：输出原始prompt结构
    // console.log('Doubao Stream 原始prompt:', JSON.stringify(prompt, null, 2));
    
    const messages = convertPromptToMessages(prompt);
    
    // 调试：输出转换后的消息格式
    // console.log('Doubao Stream 转换后的消息:', JSON.stringify(messages, null, 2));

    const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const apiKey = process.env.DOUBAO_API_KEY || 'ade655b0-cce1-4d70-9863-89b03adac124';

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        try {
          const response = await fetch(baseUrl + '/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
              model: 'doubao-1.5-vision-pro-250328',
              messages: messages,
              stream: true
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Doubao API error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No reader available');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue({
                    type: 'finish',
                    finishReason: 'stop',
                    logprobs: undefined,
                    usage: { promptTokens: 0, completionTokens: 0 },
                  });
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    controller.enqueue({
                      type: 'text-delta',
                      textDelta: delta,
                    });
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }

          controller.close();
        } catch (error) {
          console.error('Doubao Stream error details:', error);
          controller.error(error);
        }
      },
    });

    return {
      stream,
      rawCall: {
        rawPrompt: prompt,
        rawSettings: {},
      },
      request: {
        body: JSON.stringify({
          model: 'doubao-1.5-vision-pro-250328',
          messages: messages,
          stream: true
        }),
      },
      rawResponse: {
        headers: {},
      },
      warnings: [],
    };
  }
};
