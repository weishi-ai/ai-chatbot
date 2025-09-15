import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';
import { doubaoModel } from './doubao-agent/model';
import { isTestEnvironment } from '../constants';

// 检查API密钥是否存在的函数
function checkDoubaoApiKey() {
  return !!process.env.DOUBAO_API_KEY;
}

// 安全的模型选择函数
function selectModel(primaryModel: any, fallbackModel: any, modelName: string) {
  return primaryModel;
}

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': selectModel(doubaoModel, chatModel, 'chat-model'),
        'chat-model-reasoning': selectModel(doubaoModel, reasoningModel, 'chat-model-reasoning'),
        'title-model': selectModel(doubaoModel, titleModel, 'title-model'),
        'artifact-model': selectModel(doubaoModel, artifactModel, 'artifact-model'),
      },
    });
