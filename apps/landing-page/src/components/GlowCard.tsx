import React from 'react';

interface GlowCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function GlowCard({ title, description, icon, children }: GlowCardProps) {
  return (
    <div className="glass-panel p-6 glow-hover transition-all duration-300 relative group overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-soul-purple/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="relative z-10">
        {icon && <div className="mb-4 text-soul-purple w-10 h-10">{icon}</div>}
        <h3 className="text-xl font-display font-bold text-white mb-2">{title}</h3>
        <p className="text-zinc-400 mb-4 font-body leading-relaxed">{description}</p>
        {children}
      </div>
    </div>
  );
}
