import { IncomingMessage, ServerResponse } from 'node:http';
import { PersonaRuntimeContext } from './middleware.js';

export const applyPersona = async (
  req: IncomingMessage & { context?: PersonaRuntimeContext },
  res: ServerResponse,
  next: () => Promise<void>
) => {
  const context = req.context;
  if (!context?.persona) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'persona_not_set' }));
    return;
  }
  await next();
};
