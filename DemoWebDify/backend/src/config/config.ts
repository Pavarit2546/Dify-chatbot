import dotenv from 'dotenv';
import path from 'path';
import Joi from 'joi';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(8000),
    DATABASE_URL: Joi.string().uri().required(),
    LINE_CHANNEL_SECRET: Joi.string().required(),
    LINE_CHANNEL_ACCESS_TOKEN: Joi.string().required(),
    DIFY_API_KEY_LINE: Joi.string().required(),
    DIFY_API_KEY_FACEBOOK: Joi.string().required(),
    DIFY_WEBHOOK_URL: Joi.string().uri().required(),
    KNOWLEDGE_API_TOKEN: Joi.string().required(),
    FB_VERIFY_TOKEN: Joi.string().required(),
    FB_PAGE_TOKEN: Joi.string().required(),
    VALID_EXTERNAL_API_KEY: Joi.string().required(),
    DATASET_ID: Joi.string().required(),
    EXTERNAL_KNOWLEDGE_API_KEY: Joi.string().required(),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  DATABASE_URL: envVars.DATABASE_URL,
  lineChannelSecret: envVars.LINE_CHANNEL_SECRET,
  lineChannelAccessToken: envVars.LINE_CHANNEL_ACCESS_TOKEN,
  difyApiKeyLine: envVars.DIFY_API_KEY_LINE,
  difyApiKeyFacebook: envVars.DIFY_API_KEY_FACEBOOK,
  difyWebhookUrl: envVars.DIFY_WEBHOOK_URL,
  knowledgeApiToken: envVars.KNOWLEDGE_API_TOKEN,
  fbVerifyToken: envVars.FB_VERIFY_TOKEN,
  fbPageToken: envVars.FB_PAGE_TOKEN,
  varidExternalApiKey: envVars.VALID_EXTERNAL_API_KEY,
  externalKnowledgeApiKey: envVars.EXTERNAL_KNOWLEDGE_API_KEY,
  datasetId: envVars.DATASET_ID,
};
