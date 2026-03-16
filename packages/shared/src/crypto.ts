import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify
} from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function createSigningKeyPair() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' }
  });
}

export function signPayload(payload: string, privatePem: string): string {
  const normalized = privatePem.includes('\\n') ? privatePem.replace(/\\n/g, '\n') : privatePem;
  const key = createPrivateKey(normalized);
  if (key.asymmetricKeyType === 'ed25519') {
    return cryptoSign(null, Buffer.from(payload), key).toString('base64');
  }

  const signer = createSign('sha256');
  signer.update(payload);
  signer.end();
  return signer.sign(normalized, 'base64');
}

export function verifyPayload(payload: string, signature: string, publicPem: string): boolean {
  const normalized = publicPem.includes('\\n') ? publicPem.replace(/\\n/g, '\n') : publicPem;
  const key = createPublicKey(normalized);
  if (key.asymmetricKeyType === 'ed25519') {
    return cryptoVerify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64'));
  }

  const verifier = createVerify('sha256');
  verifier.update(payload);
  verifier.end();
  return verifier.verify(normalized, signature, 'base64');
}
