import { generateSigningKeys } from '@soulism/persona-signing/keygen.js';

export const runKeygen = async (): Promise<void> => {
  const keys = generateSigningKeys();
  console.log(JSON.stringify(keys, null, 2));
};
