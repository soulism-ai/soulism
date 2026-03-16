import type { ReactNode } from 'react';
import Link from 'next/link';
import { footerLinks } from '../site-content';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
  { href: '/control-plane', label: 'Admin Console' }
] as const;

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="public-frame">
      <header className="site-header">
        <Link href="/" className="site-brand">
          <span className="site-brand-mark">CA</span>
          <span>
            Cognitive AI
            <small>Open-source assistant runtime with an optional admin console</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="site-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <div>
          <p className="hero-eyebrow">Cognitive AI</p>
          <h2>Self-host the app first. Use the admin console only when you actually need operations tooling.</h2>
        </div>
        <div className="site-footer-links">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
