import React from 'react';
import Link from '@docusaurus/Link';

const quickLinks = [
  { title: 'Architecture', href: '/docs/architecture/overview' },
  { title: 'Persona system', href: '/docs/architecture/persona-system' },
  { title: 'Policy gates', href: '/docs/architecture/policy-gates' },
  { title: 'Trust and safety', href: '/docs/architecture/security-model' },
  { title: 'Release distribution', href: '/docs/architecture/release-distribution' }
];

export default function Home(): React.ReactElement {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: 32 }}>
      <h1>Cognitive AI Platform</h1>
      <p>
        Production-oriented platform for persona runtime, policy-gated tool execution, and
        auditable AI operations.
      </p>
      <ul>
        {quickLinks.map((link) => (
          <li key={link.href}>
            <Link to={link.href}>{link.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
