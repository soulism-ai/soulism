import { type FormEvent, useState } from 'react';
import type { PolicyCheckRequest } from '../api/types';

type Props = {
  personaId: string;
  userId: string;
  tenantId: string;
  onSubmit: (request: Omit<PolicyCheckRequest, 'traceId'>) => Promise<void>;
};

export const PolicyConsole = ({ personaId, userId, tenantId, onSubmit }: Props): JSX.Element => {
  const [tool, setTool] = useState('tool:webfetch');
  const [action, setAction] = useState('fetch');
  const [riskClass, setRiskClass] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [status, setStatus] = useState('idle');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('running');
    try {
      await onSubmit({
        personaId,
        userId,
        tenantId,
        tool,
        action,
        riskClass
      });
      setStatus('ok');
    } catch (error) {
      setStatus(`error: ${(error as Error).message}`);
    }
  };

  return (
    <section className="panel">
      <h3>Policy decision</h3>
      <form onSubmit={submit}>
        <div className="session-grid">
          <div className="field field-static">
            <span>User</span>
            <strong>{userId}</strong>
          </div>
          <div className="field field-static">
            <span>Tenant</span>
            <strong>{tenantId}</strong>
          </div>
          <div className="field field-static">
            <span>Persona</span>
            <strong>{personaId}</strong>
          </div>
        </div>
        <label className="field">
          Tool
          <input value={tool} onChange={(event) => setTool(event.target.value)} />
        </label>
        <label className="field">
          Action
          <input value={action} onChange={(event) => setAction(event.target.value)} />
        </label>
        <label className="field">
          Risk
          <select value={riskClass} onChange={(event) => setRiskClass(event.target.value as PolicyCheckRequest['riskClass'])}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <button type="submit">Run policy check</button>
      </form>
      <p>{status}</p>
    </section>
  );
};
