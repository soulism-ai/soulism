import type { SigningPostureStatus } from '../api/types';

type Props = {
  status?: SigningPostureStatus;
  loading?: boolean;
  error?: string;
};

export const SigningStatusPanel = ({ status, loading, error }: Props): JSX.Element => {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Signing posture</h2>
          {status && (
            <p className="muted">
              mode {status.mode} / ready {String(status.ready)} / public key {status.publicKeyConfigured ? status.publicKeySource : 'missing'}
            </p>
          )}
        </div>
      </div>
      {loading && <p>checking…</p>}
      {error && <p className="danger">error: {error}</p>}
      {status && (
        <>
          {status.issues.length > 0 ? (
            <ul className="status-list">
              {status.issues.map((issue) => (
                <li key={issue} className="danger">
                  {issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No signing posture issues detected.</p>
          )}
          <div className="grid">
            {status.providers.map((provider) => (
              <div key={provider.provider} className="panel">
                <div className="panel-head">
                  <h3>{provider.provider}</h3>
                  <span className={`pill pill-${provider.ready ? 'healthy' : 'critical'}`}>{provider.ready ? 'ready' : 'blocked'}</span>
                </div>
                <p>
                  key {provider.keyId || 'missing'} / source {provider.source}
                </p>
                <p>
                  mock {String(provider.mock)} / public key {String(provider.publicKeyPresent)}
                </p>
                {provider.error && <p className="danger">{provider.error}</p>}
              </div>
            ))}
          </div>
          <div className="grid">
            {status.channels.map((channel) => (
              <div key={channel.channel} className="panel">
                <div className="panel-head">
                  <h3>{channel.channel}</h3>
                  <span className={`pill pill-${channel.overdue ? 'critical' : 'healthy'}`}>{channel.overdue ? 'overdue' : 'in window'}</span>
                </div>
                <p>
                  current {channel.currentKeyId} / previous {channel.previousKeyId || 'none'}
                </p>
                <p>
                  rotated {channel.rotatedAt || 'unknown'} / age {channel.ageDays} days
                </p>
                <p>provider coverage {channel.providerCoverage.length > 0 ? channel.providerCoverage.join(', ') : 'none'}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && !status && !error && <p>not checked yet</p>}
    </section>
  );
};
