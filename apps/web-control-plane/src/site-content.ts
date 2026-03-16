export const capabilityCards = [
  {
    title: 'Runs in your stack',
    body: 'Bring up the gateway, memory, policy, and tool services locally with Docker Compose, then self-host from there.'
  },
  {
    title: 'Persistent memory',
    body: 'Keep session and long-term memory behind explicit policies, retention boundaries, and delete flows.'
  },
  {
    title: 'Browser and file tools',
    body: 'Expose web retrieval and constrained file actions through MCP-style service boundaries instead of ad hoc scripts.'
  },
  {
    title: 'Policy-gated actions',
    body: 'Force allow, confirm, and deny decisions through explicit policy and budget state instead of prompt folklore.'
  },
  {
    title: 'Persona packs',
    body: 'Version behavior as signed persona artifacts so the assistant stays hackable without becoming chaotic.'
  },
  {
    title: 'Admin console when needed',
    body: 'Use the control plane for operators, debugging, and audits, but keep it secondary to the end-user app story.'
  }
] as const;

export const quickStartCards = [
  {
    title: 'Read the open-source quick start',
    body: 'Start from the self-host path, local credentials, and the minimum services needed to get a working app.',
    command: 'open https://web-control-plane.vercel.app/docs/runbooks/open-source-quickstart',
    href: '/docs/runbooks/open-source-quickstart',
    cta: 'Open quick start docs'
  },
  {
    title: 'Run the local stack',
    body: 'Bring up the open-source stack with the gateway, support services, and admin console wired together.',
    command: 'pnpm install && pnpm oss:up',
    href: '/docs/runbooks/open-source-quickstart',
    cta: 'See self-host steps'
  },
  {
    title: 'Open the admin console only if you need it',
    body: 'The admin console is for operators and debugging. It should support the product, not define the product.',
    command: 'open https://web-control-plane.vercel.app/control-plane',
    href: '/control-plane',
    cta: 'Open admin console'
  }
] as const;

export const integrationItems = [
  'Docker Compose',
  'Vercel',
  'AWS ECS',
  'Next.js',
  'JWT/OIDC',
  'MCP',
  'OpenAPI',
  'AsyncAPI',
  'CLI',
  'Signed Personas',
  'Memory',
  'Browser Tools',
  'File Tools',
  'Audit Ledger',
  'Admin Console'
] as const;

export const proofPillars = [
  {
    title: 'Open-source ownership',
    body: 'The repo already carries a real license, governance docs, contributor docs, and self-host configuration instead of closed deployment-only packaging.'
  },
  {
    title: 'Self-hostable service plane',
    body: 'Gateway, policy, audit, personas, memory, files, and webfetch are exposed as deployable services instead of hidden backend dependencies.'
  },
  {
    title: 'Real quality gates',
    body: 'Build, unit, integration, and smoke paths have been restored to executable checks so green actually means something.'
  },
  {
    title: 'Admin surface is optional',
    body: 'The control plane is useful for operators, but the product story now starts from self-hosting and user ownership instead of admin workflow.'
  }
] as const;

export const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
  { href: '/control-plane', label: 'Admin Console' },
  { href: '/health', label: 'Health' }
] as const;
