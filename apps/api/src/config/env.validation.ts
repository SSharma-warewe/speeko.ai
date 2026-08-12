import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(8).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  // Login abuse controls (in-process; per API instance)
  AUTH_LOGIN_MAX_ATTEMPTS: Joi.number().integer().min(1).default(10),
  AUTH_LOGIN_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),
  ADMIN_NAME: Joi.string().optional().allow(''),
  // LiveKit Cloud (API dispatches agents; worker connects with the same vars)
  LIVEKIT_URL: Joi.string().uri().required(),
  LIVEKIT_API_KEY: Joi.string().required(),
  LIVEKIT_API_SECRET: Joi.string().required(),
  LIVEKIT_AGENT_NAME: Joi.string().default('call-agent'),
  // Worker → API call completion callback
  WORKER_CALLBACK_SECRET: Joi.string().min(8).optional().allow(''),
  API_BASE_URL: Joi.string().uri().optional().allow(''),
  // Optional SIP defaults (org trunks are preferred)
  LIVEKIT_SIP_OUTBOUND_TRUNK_ID: Joi.string().optional().allow(''),
  LIVEKIT_SIP_OUTBOUND_NUMBER: Joi.string().optional().allow(''),
  LIVEKIT_SIP_WAIT_UNTIL_ANSWERED: Joi.string().optional().allow(''),
  LIVEKIT_SIP_DEFAULT_COUNTRY_CODE: Joi.string().optional().allow(''),
  // Outbound dial queue (API process)
  QUEUE_DIALER_ENABLED: Joi.string().valid('true', 'false', '0', '1').optional(),
  QUEUE_DIALER_INTERVAL_MS: Joi.number().optional(),
  QUEUE_CLAIM_LEASE_SECONDS: Joi.number().optional(),
  QUEUE_STALE_DIALING_SECONDS: Joi.number().optional(),
  QUEUE_STALE_READY_SECONDS: Joi.number().optional(),
  QUEUE_DEFAULT_MAX_CONCURRENT: Joi.number().optional(),
  QUEUE_DEFAULT_MAX_DIALS_PER_MINUTE: Joi.number().optional(),
  QUEUE_DEFAULT_MAX_ATTEMPTS: Joi.number().optional(),
  // Resend transactional email (optional; soft-disabled when key empty)
  RESEND_API_KEY: Joi.string().optional().allow(''),
  EMAIL_FROM: Joi.string().optional().allow(''),
  EMAIL_NOTIFY_TO: Joi.string().email().optional().allow(''),
  // Comma-separated browser origins allowed by CORS (e.g. https://web.up.railway.app)
  CORS_ORIGIN: Joi.string().optional().allow(''),
  // Marketing get-demo → integration enqueue (server-side proxy; soft-required)
  ENDPOINT_URL: Joi.string().uri().optional().allow(''),
  SPEEKO_API: Joi.string().optional().allow(''),
});
