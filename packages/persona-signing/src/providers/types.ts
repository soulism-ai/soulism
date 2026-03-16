export type KmsProviderName = 'aws' | 'gcp' | 'azure';

export interface KmsSignRequest {
  keyId: string;
  digest: string;
}

export interface KmsSignResult {
  provider: KmsProviderName;
  keyId: string;
  signature: string;
  publicKey: string;
  source: string;
}

export interface KmsProviderAdapter {
  provider: KmsProviderName;
  sign(request: KmsSignRequest): Promise<KmsSignResult>;
}
