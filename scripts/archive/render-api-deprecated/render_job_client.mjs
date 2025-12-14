const DEFAULT_API_BASE_URL = 'https://api.render.com/v1';

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function resolveRenderConfig() {
  const apiKey = process.env.POKE_RENDER_API_KEY ?? process.env.RENDER_API_KEY;
  const serviceId =
    process.env.POKE_RENDER_SERVICE_ID ?? process.env.RENDER_SERVICE_ID ?? process.env.SERVICE_ID;
  const apiBaseUrl = process.env.RENDER_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const jobStartCommand =
    process.env.POKE_REFRESH_JOB_COMMAND ?? process.env.RENDER_JOB_COMMAND ?? 'node scripts/refresh_cache.mjs';
  const allowCommandOverride = normalizeBoolean(process.env.RENDER_JOB_ALLOW_OVERRIDE, false);

  if (!apiKey) {
    throw new Error(
      'Missing Render API key. Provide POKE_RENDER_API_KEY or RENDER_API_KEY in the environment.'
    );
  }

  if (!serviceId) {
    throw new Error(
      'Missing Render service ID. Provide POKE_RENDER_SERVICE_ID or ensure RENDER_SERVICE_ID is available.'
    );
  }

  return { apiKey, serviceId, apiBaseUrl, jobStartCommand, allowCommandOverride };
}

function buildJobRequestBody({ startCommand, metadata, envVars }) {
  const body = {};

  if (startCommand) {
    body.startCommand = startCommand;
  }

  if (metadata && Object.keys(metadata).length > 0) {
    body.metadata = metadata;
  }

  if (envVars && envVars.length) {
    body.envVars = envVars;
  }

  return body;
}

async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const parseError = new Error('Failed to parse Render API response as JSON');
    parseError.cause = error;
    parseError.responseText = text;
    throw parseError;
  }
}

export async function triggerRenderJob({
  startCommand,
  metadata,
  envVars,
  reason,
  logger = console,
} = {}) {
  const { apiKey, serviceId, apiBaseUrl, jobStartCommand, allowCommandOverride } = resolveRenderConfig();

  const effectiveCommand = startCommand ?? jobStartCommand;

  if (!effectiveCommand) {
    throw new Error('A start command is required to trigger a Render job.');
  }

  if (startCommand && !allowCommandOverride) {
    logger.warn(
      'Start command override ignored because RENDER_JOB_ALLOW_OVERRIDE is not enabled. Falling back to default command.'
    );
  }

  const payload = buildJobRequestBody({
    startCommand: allowCommandOverride ? effectiveCommand : jobStartCommand,
    metadata: {
      ...metadata,
      ...(reason ? { reason } : {}),
    },
    envVars,
  });

  const response = await fetch(`${apiBaseUrl}/services/${serviceId}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail;

    try {
      const errorBody = await parseJsonSafely(response);
      errorDetail = errorBody ?? { status: response.status, statusText: response.statusText };
    } catch (parseError) {
      errorDetail = {
        status: response.status,
        statusText: response.statusText,
        parseError: parseError.message,
      };
    }

    const error = new Error('Render job dispatch failed');
    error.status = response.status;
    error.statusText = response.statusText;
    error.detail = errorDetail;
    throw error;
  }

  const data = await parseJsonSafely(response);
  logger.info?.(
    `Render job queued: ${data?.id ?? 'unknown id'}${reason ? ` (reason: ${reason})` : ''}.`
  );
  return data;
}
