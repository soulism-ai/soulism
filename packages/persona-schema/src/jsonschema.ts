import { PersonaManifestSchema, PersonaPackSchema } from './types.js';

export function buildJsonSchema() {
  return {
    personaManifest: PersonaManifestSchema,
    personaPack: PersonaPackSchema
  };
}
