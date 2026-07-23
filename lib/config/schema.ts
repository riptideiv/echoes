import { z } from "zod";

// Browsers

export const BrowserEngineSchema = z.enum([
  "chromium",
  "firefox",
  "safari",
  "json",
]);

export const BrowserSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  engine: BrowserEngineSchema,
  path: z.string().min(1),
  enabled: z.boolean(),
});

export type BrowserSource = z.infer<typeof BrowserSourceSchema>;

// Config

export const ConfigV1Schema = z.object({
  schemaVersion: z.literal(1),

  sessions: z.object({
    claudeProjectsDir: z.string().min(1).nullable(),
    codexHome: z.string().min(1).nullable(),
  }),

  browsers: z.array(BrowserSourceSchema),

  generation: z.object({
    windowDays: z.number().int().min(1).max(365),
    provider: z.string().min(1),
    baseUrl: z.string().url(),
    model: z.string().min(1),
    generationTemperature: z.number().min(0).max(2),
    tagTemperature: z.number().min(0).max(2),
  }),

  server: z.object({
    port: z.number().int().min(1).max(65535),
    openBrowser: z.boolean(),
  }),
});

export type EchoesReportConfigV1 = z.infer<typeof ConfigV1Schema>;

// Secrets

export const SecretsV1Schema = z.object({
  schemaVersion: z.literal(1),

  providers: z.object({
    deepseek: z.object({
      apiKey: z.string(),
    }),
  }),
});

export type EchoesReportSecretsV1 = z.infer<typeof SecretsV1Schema>;
