import { spawnSync } from 'node:child_process';

const run = async () => {
  const commands = [
    ['pnpm', ['tsx', 'tools/contracts/validate-openapi.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-asyncapi.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-mcp.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-marketplace.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-packs.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-telemetry-alerts.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-alert-providers.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-telemetry-pipeline.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-kms-providers.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-eval-regression-policy.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-e2e-parity-policy.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-runtime-parity-policy.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-framework-parity-policy.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-framework-boot-policy.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-framework-cli-boot-policy.ts']],
    ['pnpm', ['tsx', 'tools/scripts/sign-marketplace-descriptors-kms.ts', '--provider=aws', '--key-id=marketplace-key-1', '--publisher=soulism-labs', '--min-cli-version=0.1.0']],
    ['pnpm', ['tsx', 'tools/contracts/validate-distribution-signing.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-distribution-signatures.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-signing-rotation.ts']],
    ['pnpm', ['tsx', 'tools/scripts/prove-kms-provider-signing.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-kms-live-readiness.ts']],
    ['pnpm', ['tsx', 'tools/contracts/validate-adapter-contracts.ts']],
    ['pnpm', ['tsx', 'ci/adapters/validate-nextjs.ts']],
    ['pnpm', ['tsx', 'ci/adapters/validate-expo.ts']],
    ['pnpm', ['tsx', 'ci/adapters/validate-adapters.ts']]
  ] as const;

  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.log('Contract checks completed.');
};

void run();
