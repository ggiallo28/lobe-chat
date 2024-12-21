import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
// import { useSession } from 'next-auth/react';
// import getServerSession from "next-auth";
// import { config } from '@/libs/next-auth/auth.config';
// import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { experimental_buildLlama2Prompt } from 'ai/prompts';

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
    } else {
      const { fromContainerMetadata } = require('@aws-sdk/credential-providers');
      this.client = new BedrockRuntimeClient({
        credentials: fromContainerMetadata({
          maxRetries: 0,
          timeout: 1000,
        }),
        // credentials: fromCognitoIdentityPool({
        //   clientConfig: { region: this.region },
        //   identityPoolId: 'us-east-1:e0a66a3c-899a-4094-8677-c01474825c27', //process.env.COGNITO_IDENTITY_POOL_ID || '',
        //   logins: {
        //     [`cognito-idp.${this.region}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`]:
        //       async () => {
        //         // const { data: session } = useSession();
        //         // const session = await getSession();
        //         // if (!session || !session.bearerToken) {
        //         //   throw new Error('No valid session found. Please log in.');
        //         // }
        //         // return session.bearerToken;
        //         return 'eyJraWQiOiJBWitWQkxNMzFEenFPM0lMaGdVOVhsWWlsNXJ3RHR2elFvR003WHB0NmhzPSIsImFsZyI6IlJTMjU2In0.eyJhdF9oYXNoIjoiNGc0ak9ZRmdGV2JGZXlqX3ExQURtUSIsInN1YiI6IjU0NzgyNDA4LWMwNzEtNzAyOC1jYmM4LTJmMTJhN2MyOTM3MSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9idFdLODhzVUciLCJjb2duaXRvOnVzZXJuYW1lIjoiZy5tdWNjaW9sbzkxQGdtYWlsLmNvbSIsIm9yaWdpbl9qdGkiOiIyMGY5ZWY5My01OTAyLTQ2ZGItOTg2Ny0wOWY2NTU1MTVkMWYiLCJhdWQiOiIxb2QzbzlycHRhNnRwM2FkZHJodnNnNTgwdSIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzM0ODE1MTY4LCJleHAiOjE3MzQ4MTg3NjgsImlhdCI6MTczNDgxNTE2OCwianRpIjoiYzZlZjIwYTctMzYzNi00ODVhLWI1MGUtMDBhN2NhYzA1N2U1IiwiZW1haWwiOiJnLm11Y2Npb2xvOTFAZ21haWwuY29tIn0.INOo9tCSHygNFr_FHYGicPcG-vaUAoz7vDff_-VI8_cNup-WI9OlnGBwDb8X1NK2xi6LP3vS57qOE1XqKeDxVIHlu_SKBq6gE4DbaLbHoMHbPVXyS2C08oriTBzmnI_L9-I0OruJCexCoTNs0NR8swsb2O9jfDPnBzpXma_720goOmV3UYqK3TFQQqgXx_iPX1NnZYvlAu-F3a2i1ecI1QsmkWYOy3GvajTrASAY1HKfpZ9oJuNa_odmXqPIQqZhLuypbzIW9Med16TOIc_psELnaWS1y2j7IzOyOGOlHA02TCkzF6SkR74EvlJXBySplr3vJsLR8e9IQmEY2LIdDg';
        //       },
        //   },
        // }),
        region: this.region,
      });
    }
  }

  async chat(payload: ChatStreamPayload, options?: ChatCompetitionOptions) {
    if (payload.model.startsWith('meta')) return this.invokeLlamaModel(payload, options);

    return this.invokeClaudeModel(payload, options);
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
