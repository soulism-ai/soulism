import { GetPublicKeyCommand, KMSClient, SignCommand, SigningAlgorithmSpec } from '@aws-sdk/client-kms';
import { signPayload } from '@soulism/shared/crypto.js';
import { resolveMockKmsKey } from '../kms.js';
import type { KmsProviderAdapterOptions } from './factory.js';
import type { KmsProviderAdapter, KmsSignRequest, KmsSignResult } from './types.js';

const toPem = (der: Uint8Array): string => {
  const body = Buffer.from(der).toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
};

const normalizeAwsKeyId = (keyId: string): string => {
  if (keyId.startsWith('alias/') || keyId.startsWith('arn:')) return keyId;
  return `alias/${keyId}`;
};

const chooseSigningAlgorithm = (
  algorithms: readonly SigningAlgorithmSpec[] | undefined
): SigningAlgorithmSpec => {
  const preferred = [
    SigningAlgorithmSpec.ECDSA_SHA_256,
    SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256
  ];
  for (const algorithm of preferred) {
    if (algorithms?.includes(algorithm)) return algorithm;
  }
  throw new Error(`unsupported_aws_kms_signing_algorithms:${(algorithms ?? []).join(',')}`);
};

export const createAwsKmsAdapter = (options: KmsProviderAdapterOptions = {}): KmsProviderAdapter => ({
  provider: 'aws',
  async sign(request: KmsSignRequest): Promise<KmsSignResult> {
    const keyMapJson = options.keyMapJson || process.env.COGNITIVE_AI_KMS_AWS_KEYS_JSON;
    const keyMapPath = options.keyMapPath || process.env.COGNITIVE_AI_KMS_AWS_KEYS_PATH;

    if ((keyMapJson && keyMapJson.trim().length > 0) || (keyMapPath && keyMapPath.trim().length > 0)) {
      const resolved = resolveMockKmsKey(request.keyId, {
        keyMapJson,
        keyMapPath
      });
      return {
        provider: 'aws',
        keyId: request.keyId,
        signature: signPayload(request.digest, resolved.privateKey),
        publicKey: resolved.publicKey,
        source: `aws:${resolved.source}`
      };
    }

    const client = new KMSClient({});
    const kmsKeyId = normalizeAwsKeyId(request.keyId);
    const publicKeyResponse = await client.send(new GetPublicKeyCommand({ KeyId: kmsKeyId }));
    if (!publicKeyResponse.PublicKey) {
      throw new Error(`aws_kms_public_key_missing:${kmsKeyId}`);
    }

    const signingAlgorithm = chooseSigningAlgorithm(publicKeyResponse.SigningAlgorithms);
    const signed = await client.send(
      new SignCommand({
        KeyId: kmsKeyId,
        Message: Buffer.from(request.digest),
        MessageType: 'RAW',
        SigningAlgorithm: signingAlgorithm
      })
    );

    if (!signed.Signature) {
      throw new Error(`aws_kms_signature_missing:${kmsKeyId}`);
    }

    return {
      provider: 'aws',
      keyId: request.keyId,
      signature: Buffer.from(signed.Signature).toString('base64'),
      publicKey: toPem(publicKeyResponse.PublicKey),
      source: 'aws:kms'
    };
  }
});
