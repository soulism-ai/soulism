export default function Page() {
  return (
    <div className="dashboard-grid">
      <section className="dashboard-card span-2 glow-border">
        <div className="card-header">
          <h3>System Health</h3>
          <span className="pill pill-healthy">Optimal</span>
        </div>
        <div className="stats-row">
          <div className="stat-circle">
             <svg viewBox="0 0 36 36" className="circular-chart purple">
               <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path className="circle" strokeDasharray="30, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             </svg>
             <div className="stat-val">3%<small>CPU</small></div>
          </div>
          <div className="stat-circle">
             <svg viewBox="0 0 36 36" className="circular-chart blue">
               <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path className="circle" strokeDasharray="24, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             </svg>
             <div className="stat-val">24%<small>RAM</small></div>
          </div>
          <div className="stat-circle">
             <svg viewBox="0 0 36 36" className="circular-chart orange">
               <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path className="circle" strokeDasharray="57, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             </svg>
             <div className="stat-val">57°<small>TEMP</small></div>
          </div>
          <div className="stat-circle">
             <svg viewBox="0 0 36 36" className="circular-chart green">
               <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path className="circle" strokeDasharray="99, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             </svg>
             <div className="stat-val">99%<small>UP</small></div>
          </div>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="card-header">
          <h3>Active Instances</h3>
        </div>
        <div className="instance-list">
          <div className="instance-item">
            <span className="status-indicator healthy"></span>
            <div className="instance-info"><strong>soulism-core</strong><small>pid: 1042</small></div>
            <span className="pill pill-healthy align-right">Running</span>
          </div>
          <div className="instance-item">
            <span className="status-indicator healthy"></span>
            <div className="instance-info"><strong>agent-dashboard</strong><small>pid: 1088</small></div>
            <span className="pill pill-healthy align-right">Running</span>
          </div>
          <div className="instance-item disabled">
            <span className="status-indicator off"></span>
            <div className="instance-info"><strong>tailscaled</strong><small>pid: -</small></div>
            <span className="pill pill-critical align-right">Stopped</span>
          </div>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="card-header">
          <h3>Thought Stream</h3>
        </div>
        <div className="terminal-log">
          <div><span className="time">[14:02:11]</span> <span className="info">SYS:</span> Memory sync complete.</div>
          <div><span className="time">[14:02:15]</span> <span className="thought">THK:</span> User requested web query on 'openclaw'. Routing to browser subagent.</div>
          <div><span className="time">[14:02:18]</span> <span className="action">ACT:</span> Spawning headless browser session...</div>
          <div><span className="time">[14:02:22]</span> <span className="success">OK:</span> Page loaded. Taking screenshot.</div>
          <div className="cursor-blink">_</div>
        </div>
      </section>

      <section className="dashboard-card span-2">
         <div className="card-header">
            <h3>Quick Actions</h3>
         </div>
         <div className="action-buttons">
            <button className="btn-glass">Restart Soulism</button>
            <button className="btn-glass">Restart Dashboard</button>
            <button className="btn-glass">Clear Cache</button>
            <button className="btn-glass">Usage Scape</button>
         </div>
      </section>
    </div>
  );
}
