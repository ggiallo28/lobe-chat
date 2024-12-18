import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { experimental_buildLlama2Prompt } from 'ai/prompts';
import { getSession } from 'next-auth/react';

import { LobeRuntimeAI } from '../BaseAI';
import { AgentRuntimeErrorType } from '../error';
import { ChatCompetitionOptions, ChatStreamPayload, ModelProvider } from '../types';
import { buildAnthropicMessages, buildAnthropicTools } from '../utils/anthropicHelpers';
import { AgentRuntimeError } from '../utils/createError';
import { debugStream } from '../utils/debugStream';
import { StreamingResponse } from '../utils/response';
import {
  AWSBedrockClaudeStream,
  AWSBedrockLlamaStream,
  createBedrockStream,
} from '../utils/streams';

export interface LobeBedrockAIParams {
  accessKeyId?: string;
  accessKeySecret?: string;
  region?: string;
  sessionToken?: string;
}

export class LobeBedrockAI implements LobeRuntimeAI {
  private client: BedrockRuntimeClient;
  private isFromSession = false;
  region: string;

  constructor({ region, accessKeyId, accessKeySecret, sessionToken }: LobeBedrockAIParams = {}) {
    this.region = region ?? 'us-east-1';

    if (accessKeyId && accessKeySecret) {
      this.client = new BedrockRuntimeClient({
        credentials: {
          accessKeyId,
          secretAccessKey: accessKeySecret,
          sessionToken,
        },
        region: this.region,
      });
      this.isFromSession = false;
    } else {
      this.client = new BedrockRuntimeClient({ region: this.region });
      this.isFromSession = true;
    }
  }

  async chat(payload: ChatStreamPayload, options?: ChatCompetitionOptions) {
    if (this.isFromSession) {
      await this.updateClientCredentials();
    }

    if (payload.model.startsWith('meta')) return this.invokeLlamaModel(payload, options);

    return this.invokeClaudeModel(payload, options);
  }

  private async updateClientCredentials() {
    const session = await getSession();
    if (session && session.user) {
      if (session.user.jwt) {
        const region = process.env.AWS_REGION || 'us-east-1';
        const userPoolId = process.env.AWS_USER_POOL_ID || '';

        const cognitoIssuer = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;

        const credentials = await fromCognitoIdentityPool({
          clientConfig: { region },
          identityPoolId: process.env.AWS_IDENTITY_POOL_ID || '',
          logins: {
            [cognitoIssuer]: session.user.jwt,
          },
        })();
        this.client = new BedrockRuntimeClient({
          credentials: credentials,
          region: this.region,
        });
      } else {
        throw new Error('Session does not contain valid AWS credentials.');
      }
    } else {
      throw new Error('No valid session found. Please log in.');
    }
  }

  private invokeClaudeModel = async (
    payload: ChatStreamPayload,
    options?: ChatCompetitionOptions,
  ): Promise<Response> => {
    const { max_tokens, messages, model, temperature, top_p, tools } = payload;
    const system_message = messages.find((m) => m.role === 'system');
    const user_messages = messages.filter((m) => m.role !== 'system');

    const command = new InvokeModelWithResponseStreamCommand({
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: max_tokens || 4096,
        messages: await buildAnthropicMessages(user_messages),
        system: system_message?.content as string,
        temperature: temperature / 2,
        tools: buildAnthropicTools(tools),
        top_p: top_p,
      }),
      contentType: 'application/json',
      modelId: model,
    });

    try {
      // Ask Claude for a streaming chat completion given the prompt
      const res = await this.client.send(command, { abortSignal: options?.signal });

      const claudeStream = createBedrockStream(res);

      const [prod, debug] = claudeStream.tee();

      if (process.env.DEBUG_BEDROCK_CHAT_COMPLETION === '1') {
        debugStream(debug).catch(console.error);
      }

      // Respond with the stream
      return StreamingResponse(AWSBedrockClaudeStream(prod, options?.callback), {
        headers: options?.headers,
      });
    } catch (e) {
      const err = e as Error & { $metadata: any };

      throw AgentRuntimeError.chat({
        error: {
          body: err.$metadata,
          message: err.message,
          type: err.name,
        },
        errorType: AgentRuntimeErrorType.ProviderBizError,
        provider: ModelProvider.Bedrock,
        region: this.region,
      });
    }
  };

  private invokeLlamaModel = async (
    payload: ChatStreamPayload,
    options?: ChatCompetitionOptions,
  ): Promise<Response> => {
    const { max_tokens, messages, model } = payload;
    const command = new InvokeModelWithResponseStreamCommand({
      accept: 'application/json',
      body: JSON.stringify({
        max_gen_len: max_tokens || 400,
        prompt: experimental_buildLlama2Prompt(messages as any),
      }),
      contentType: 'application/json',
      modelId: model,
    });

    try {
      // Ask Claude for a streaming chat completion given the prompt
      const res = await this.client.send(command);

      const stream = createBedrockStream(res);

      const [prod, debug] = stream.tee();

      if (process.env.DEBUG_BEDROCK_CHAT_COMPLETION === '1') {
        debugStream(debug).catch(console.error);
      }
      // Respond with the stream
      return StreamingResponse(AWSBedrockLlamaStream(prod, options?.callback), {
        headers: options?.headers,
      });
    } catch (e) {
      const err = e as Error & { $metadata: any };

      throw AgentRuntimeError.chat({
        error: {
          body: err.$metadata,
          message: err.message,
          region: this.region,
          type: err.name,
        },
        errorType: AgentRuntimeErrorType.ProviderBizError,
        provider: ModelProvider.Bedrock,
        region: this.region,
      });
    }
  };
}

export default LobeBedrockAI;
