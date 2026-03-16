import { runCompose } from './commands/compose.js';
import { runInit } from './commands/init.js';
import { runKeygen } from './commands/keygen.js';
import { runList } from './commands/list.js';
import { runLint } from './commands/lint.js';
import { runSign } from './commands/sign.js';
import { runShow } from './commands/show.js';
import { runValidate } from './commands/validate.js';
import { runVerify } from './commands/verify.js';
import { runInstall } from './commands/install.js';
import { runRender } from './commands/render.js';
import { runSigningStatus } from './commands/signing-status.js';
import { buildPolicyHelp } from './commands/policy.js';
import { runPolicyCheck } from './commands/policy-check.js';
import { runServer } from './commands/server.js';
import { runEvidence } from './commands/evidence.js';

const [cmd, ...args] = process.argv.slice(2);
type CliOption = Record<string, string>;

const printHelp = () => {
  console.log(
    'soulism [init|list|show|validate|lint|compose|install|render|keygen|sign|verify|signing-status|policy|policy-check|evidence|server]'
  );
  console.log(buildPolicyHelp());
  console.log('soulism evidence export --endpoint=<url> [--out=<path>] [filters]');
};

const parseArgs = (input: string[]): { positional: string[]; options: CliOption } => {
  const positional: string[] = [];
  const options: CliOption = {};
  for (const arg of input) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq === -1) {
      const key = arg.slice(2);
      if (key.length > 0) {
        options[key] = 'true';
      }
      continue;
    }
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    if (key) options[key] = value;
  }
  return { positional, options };
};

const run = async () => {
  try {
    const { positional, options } = parseArgs(args);
    switch (cmd) {
      case 'init':
        await runInit();
        return;
      case 'list':
        await runList();
        return;
      case 'show':
        await runShow(args[0]);
        return;
      case 'validate':
        await runValidate(args[0]);
        return;
      case 'lint':
        await runLint(args[0]);
        return;
      case 'compose':
        await runCompose(args[0] ?? './packs', args[1] ?? '');
        return;
      case 'install': {
        let target: string | undefined;
        let registryUrl: string | undefined;
        const signatureMode = options['signature-mode'];

        if (options.target) {
          target = options.target;
        }
        if (options['registry-url']) {
          registryUrl = options['registry-url'];
        }

        if (!target && !registryUrl && positional[1]) {
          const candidate = positional[1];
          if (/^https?:\/\//i.test(candidate) || /^http[s]?:/.test(candidate)) {
            registryUrl = candidate;
          } else {
            target = candidate;
          }
        }

        await runInstall(positional[0], {
          target,
          registryUrl,
          signature: options.signature,
          publicKey: options['public-key'],
          signatureMode
        });
        return;
      }
      case 'render':
        await runRender(args[0], args[1], args[2]);
        return;
      case 'keygen':
        await runKeygen();
        return;
      case 'sign':
        await runSign(positional[0], positional[1] || '', positional[2], {
          kmsProvider: options['kms-provider'],
          keyId: options['key-id'],
          keyMapPath: options['key-map-path']
        });
        return;
      case 'signing-status':
        await runSigningStatus({
          kmsProvidersPolicyPath: options['kms-providers-policy'],
          signingRotationPolicyPath: options['signing-rotation-policy'],
          signatureMode: options['signature-mode'],
          signingPublicKeyPath: options['signing-public-key-path']
        });
        return;
      case 'verify':
        await runVerify(args[0], args[1], args[2], options['signature-mode']);
        return;
      case 'policy':
      case 'policy-check': {
        const explicitEndpoint = positional[0];
        const looksLikeEndpoint = explicitEndpoint ? /^https?:\/\//i.test(explicitEndpoint) || /^http[s]?:/.test(explicitEndpoint) : false;
        const endpoint = options.endpoint || (looksLikeEndpoint ? explicitEndpoint : 'http://localhost:4001');
        const requestBody = positional[looksLikeEndpoint ? 1 : 0] || '{}';
        const exitCode = await runPolicyCheck(endpoint, requestBody, args);
        if (exitCode !== 0) process.exit(exitCode);
        return;
      }
      case 'server':
        await runServer();
        return;
      case 'evidence':
        await runEvidence(positional[0], args.slice(1));
        return;
      default:
        printHelp();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

void run();
