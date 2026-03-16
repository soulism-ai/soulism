import { getSigningPostureStatus } from '@soulism/persona-signing/status.js';

type SigningStatusOptions = {
  kmsProvidersPolicyPath?: string;
  signingRotationPolicyPath?: string;
  signatureMode?: string;
  signingPublicKeyPath?: string;
};

export const runSigningStatus = async (options: SigningStatusOptions = {}): Promise<void> => {
  const status = await getSigningPostureStatus({
    productionMode: process.env.PRODUCTION_MODE === 'true',
    strictSigning: process.env.STRICT_SIGNING === 'true',
    signaturePolicyMode: options.signatureMode || process.env.SIGNATURE_POLICY_MODE,
    signingPublicKey: process.env.SIGNING_PUBLIC_KEY,
    signingPublicKeyPath: options.signingPublicKeyPath || process.env.SIGNING_PUBLIC_KEY_PATH,
    kmsProvidersPolicyPath: options.kmsProvidersPolicyPath || process.env.KMS_PROVIDERS_POLICY_PATH,
    signingRotationPolicyPath: options.signingRotationPolicyPath || process.env.SIGNING_ROTATION_POLICY_PATH
  });

  console.log(JSON.stringify(status, null, 2));
};
