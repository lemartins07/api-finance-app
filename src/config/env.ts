import { config } from 'dotenv'

config()

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface AppEnv {
  port: number
  openaiApiKey: string
  openaiModel: string
}

export function loadEnv(): AppEnv {
  const env: AppEnv = {
    port: parsePort(process.env.PORT, 3333),
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  }

  if (!env.openaiApiKey) {
    throw new Error('Variável OPENAI_API_KEY não definida.')
  }

  return env
}
