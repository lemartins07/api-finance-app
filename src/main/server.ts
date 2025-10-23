import { loadEnv } from '../config/env'
import { buildApp } from './app'

async function bootstrap(): Promise<void> {
  let env
  try {
    env = loadEnv()
  } catch (error) {
    console.error('Falha ao carregar variáveis de ambiente:', error)
    process.exit(1)
  }

  const app = buildApp()

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error, 'Erro ao iniciar o servidor')
    process.exit(1)
  }
}

bootstrap()
