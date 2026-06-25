const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const DIRECT_MODEL_ID = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

let bedrockClient = null;

function getRegion() {
  return process.env.AWS_REGION || DEFAULT_REGION;
}

function getConfiguredModelId() {
  return process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
}

function getModelCandidates() {
  return Array.from(new Set([getConfiguredModelId(), DIRECT_MODEL_ID].filter(Boolean)));
}

function isConfigured() {
  return Boolean(
    process.env.AWS_REGION
      && process.env.AWS_ACCESS_KEY_ID
      && process.env.AWS_SECRET_ACCESS_KEY
  );
}

function createClient() {
  return new BedrockRuntimeClient({
    region: getRegion(),
    credentials: isConfigured()
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

function getClient() {
  if (!bedrockClient) {
    bedrockClient = createClient();
  }
  return bedrockClient;
}

function safeLog(message, metadata = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(cleaned).length > 0) {
    console.log(`[bedrock] ${message}`, cleaned);
    return;
  }

  console.log(`[bedrock] ${message}`);
}

function getHealthStatus() {
  return {
    configured: isConfigured(),
    region: getRegion(),
    modelId: getConfiguredModelId(),
    canTest: isConfigured(),
  };
}

function buildPayload(options) {
  const {
    prompt,
    system,
    maxTokens = 256,
    temperature = 0.2,
  } = options;

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  };

  if (system) {
    payload.system = system;
  }

  return payload;
}

function extractTextFromResponse(responseBody) {
  if (Array.isArray(responseBody.content) && responseBody.content[0]?.text) {
    return responseBody.content[0].text;
  }

  throw new Error('Invalid Bedrock response structure.');
}

function shouldRetryWithFallback(error) {
  const name = error?.name || error?.code || '';
  const message = error?.message || '';
  const normalizedMessage = message.toLowerCase();

  return (
    ['ValidationException', 'ResourceNotFoundException', 'AccessDeniedException'].includes(name)
    || normalizedMessage.includes('inference profile')
    || normalizedMessage.includes('model identifier is invalid')
    || normalizedMessage.includes('model not found')
    || normalizedMessage.includes('on-demand throughput')
  );
}

function normalizeInvocationError(error, modelId) {
  const normalized = new Error(error.message || 'Bedrock invocation failed.');
  normalized.name = error.name || 'BedrockInvocationError';
  normalized.modelId = modelId;
  normalized.statusCode = error?.$metadata?.httpStatusCode;
  normalized.requestId = error?.$metadata?.requestId;
  normalized.cause = error;
  return normalized;
}

async function invokeTextWithMetadata(options) {
  if (!isConfigured()) {
    throw new Error('AWS Bedrock is not fully configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
  }

  const payload = buildPayload(options);
  const client = getClient();
  const modelCandidates = options.modelId ? [options.modelId] : getModelCandidates();
  const timeoutMs = Number(options.timeoutMs || process.env.BEDROCK_TIMEOUT_MS || 45000);

  let lastError = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const modelId = modelCandidates[index];
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });
    let timeoutId = null;

    try {
      const abortController = new AbortController();
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      safeLog('Invoking Claude Sonnet 4.5', {
        region: getRegion(),
        modelId,
        maxTokens: payload.max_tokens,
        timeoutMs,
      });

      const response = await client.send(command, {
        abortSignal: abortController.signal,
      });
      clearTimeout(timeoutId);
      const decoded = new TextDecoder().decode(response.body);
      const responseBody = JSON.parse(decoded);
      const text = extractTextFromResponse(responseBody);
      safeLog('Bedrock response received', {
        region: getRegion(),
        modelId,
        stopReason: responseBody.stop_reason,
      });
      return {
        text,
        stopReason: responseBody.stop_reason || '',
        modelId,
        rawResponse: responseBody,
      };
    } catch (error) {
      try {
        clearTimeout(timeoutId);
      } catch (clearError) {
        // Ignore timeout cleanup issues.
      }

      const isAbortError = error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
      const errorToNormalize = isAbortError
        ? new Error(`Bedrock request timed out after ${timeoutMs}ms.`)
        : error;

      const normalized = normalizeInvocationError(error, modelId);
      if (isAbortError) {
        normalized.name = 'BedrockTimeoutError';
        normalized.message = errorToNormalize.message;
      }
      lastError = normalized;

      console.error('[bedrock] Invocation failed', {
        region: getRegion(),
        modelId,
        name: normalized.name,
        message: normalized.message,
        statusCode: normalized.statusCode,
        requestId: normalized.requestId,
      });

      const canFallback = index < modelCandidates.length - 1 && shouldRetryWithFallback(error);
      if (!canFallback) {
        throw normalized;
      }
    }
  }

  throw lastError || new Error('Bedrock invocation failed.');
}

async function invokeText(options) {
  const response = await invokeTextWithMetadata(options);
  return response.text;
}

function stripMarkdownFences(text) {
  return String(text || '')
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function createJsonExtractionError(message, errorCode) {
  const error = new Error(message);
  error.name = 'BedrockJsonExtractionError';
  error.errorCode = errorCode;
  return error;
}

function extractJsonObject(text, options = {}) {
  const {
    stopReason = '',
  } = options;

  const cleaned = stripMarkdownFences(text);
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw createJsonExtractionError('No JSON object found in model response.', 'BEDROCK_JSON_NOT_FOUND');
  }

  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace === -1 || lastBrace < firstBrace) {
    const errorCode = stopReason === 'max_tokens'
      ? 'BEDROCK_OUTPUT_TRUNCATED'
      : 'BEDROCK_JSON_INCOMPLETE';
    throw createJsonExtractionError('Incomplete JSON object in model response.', errorCode);
  }

  const sliced = cleaned.slice(firstBrace, lastBrace + 1);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < sliced.length; index += 1) {
    const char = sliced[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (index !== sliced.length - 1) {
          return sliced.slice(0, index + 1);
        }

        return sliced;
      }
    }
  }

  const errorCode = stopReason === 'max_tokens'
    ? 'BEDROCK_OUTPUT_TRUNCATED'
    : 'BEDROCK_JSON_INCOMPLETE';
  throw createJsonExtractionError('Incomplete JSON object in model response.', errorCode);
}

async function invokeJson(options) {
  const response = await invokeTextWithMetadata(options);
  const text = response.text;

  try {
    const jsonText = extractJsonObject(text, {
      stopReason: response.stopReason,
    });
    return JSON.parse(jsonText);
  } catch (error) {
    const normalized = new Error(error.message || 'Failed to parse Bedrock JSON response.');
    normalized.name = 'BedrockJsonParseError';
    normalized.rawText = text;
    normalized.errorCode = error.errorCode || 'BEDROCK_JSON_PARSE_FAILED';
    throw normalized;
  }
}

async function testConnection() {
  const response = await invokeJson({
    system: 'Return valid JSON only.',
    prompt: 'Respond with {"ok":true,"service":"bedrock"} and nothing else.',
    maxTokens: 60,
    temperature: 0,
  });

  return {
    ok: response.ok === true,
    service: response.service || 'bedrock',
  };
}

module.exports = {
  DEFAULT_MODEL_ID,
  getHealthStatus,
  getModelCandidates,
  getRegion,
  extractJsonObject,
  invokeJson,
  invokeText,
  invokeTextWithMetadata,
  isConfigured,
  stripMarkdownFences,
  testConnection,
};
