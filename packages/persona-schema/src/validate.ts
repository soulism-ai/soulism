import { PersonaPackSchema, PersonaManifestSchema } from './types.js';
import { AppError } from '@soulism/shared/errors.js';

export const validatePersonaManifest = (value: unknown) => {
  const parse = PersonaManifestSchema.safeParse(value);
  if (!parse.success) {
    throw new AppError(`Invalid persona manifest: ${parse.error.message}`, 'validation_error', 400);
  }
  return parse.data;
};

export const validatePersonaPack = (value: unknown) => {
  const parse = PersonaPackSchema.safeParse(value);
  if (!parse.success) {
    throw new AppError(`Invalid persona pack: ${parse.error.message}`, 'validation_error', 400);
  }
  return parse.data;
};
