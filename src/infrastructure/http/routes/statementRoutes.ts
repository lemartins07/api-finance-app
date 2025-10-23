import { FastifyInstance } from 'fastify'

import { ParseStatementController } from '../controllers/ParseStatementController'

export function registerStatementRoutes(
  app: FastifyInstance,
  controller: ParseStatementController,
): void {
  app.post('/statements/parse', async (request, reply) => {
    await controller.handle(request, reply)
  })
}
