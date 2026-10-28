import { useEffect, useState, type FormEvent } from "react";
import { CATEGORIES, type Alert, type CaseView, type Category, type PolicyName, type ScoreSummary } from "../../server/src/types";
import { api } from "./api";

const CATEGORY_LABEL: Record<Category, string> = {
  phishing: "Phishing",
  malware: "Malware",
  network_scan: "Network scan",
  credential_access: "Credential access",
};

const POLICY_LABEL: Record<PolicyName, string> = {
  REPEAT_NOISE_DAMPING: "noise damping",
  CRITICAL_ASSET_BOOST: "critical asset boost",
  APT_CAMPAIGN_LINK: "APT campaign link",
};

/** Severity bands on the 0–100 scale; `to` is exclusive except for the last band. */
const BANDS = [
  { name: "Low", from: 0, to: 30 },
  { name: "Medium", from: 30, to: 60 },
  { name: "High", from: 60, to: 85 },
  { name: "Critical", from: 85, to: 100 },
] as const;

function tokens(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean))];
}

export function App() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [policyNames, setPolicyNames] = useState<string[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [policyInput, setPolicyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.listAlerts(), api.listPolicies(), api.getCase()])
      .then(([a, p, c]) => {
        setAlerts(a);
        setPolicyNames(p);
        applyCase(c);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function applyCase(c: CaseView) {
    setCaseView(c);
    setPolicyInput(c.policies.join(", "));
  }

  async function run(action: () => Promise<CaseView>, syncPolicyInput = true) {
    setBusy(true);
    setError(null);
    try {
      const c = await action();
      if (syncPolicyInput) applyCase(c);
      else setCaseView(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onApplyPolicies(e: FormEvent) {
    e.preventDefault();
    void run(() => api.setPolicies(policyInput));
  }

  function togglePolicy(name: string) {
    const current = tokens(policyInput);
    const next = current.includes(name) ? current.filter((t) => t !== name) : [...current, name];
    setPolicyInput(next.join(", "));
  }

  const inCase = new Set(caseView?.alerts.map((a) => a.id));
  const ignored = new Set(caseView?.summary.ignoredAlertIds);
  const typed = tokens(policyInput);
  const pending = caseView !== null && [...typed].sort().join() !== [...caseView.policies].sort().join();

  return (
    <div className="app">
      <header className="masthead">
        <h1>Case risk scoring</h1>
        <p>Build a case from alerts, choose scoring policies, and see what to investigate first.</p>
      </header>

      <main className="layout">
        <section className="queue" aria-labelledby="queue-title">
          <div className="pane-head">
            <h2 id="queue-title">Alert queue</h2>
            <span className="count">{alerts.length} alerts</span>
          </div>
          {CATEGORIES.map((category) => {
            const group = alerts.filter((a) => a.category === category);
            if (group.length === 0) return null;
            return (
              <div className="group" key={category}>
                <h3 className="group-title">
                  {CATEGORY_LABEL[category]} <span className="count">{group.length}</span>
                </h3>
                <ul className="rows">
                  {group.map((a) => (
                    <li key={a.id} className={inCase.has(a.id) ? "row row--taken" : "row"}>
                      <AlertText alert={a} />
                      <span className="row-score">{a.baseScore}</span>
                      <button
                        className="btn btn--small"
                        disabled={busy || inCase.has(a.id)}
                        onClick={() => run(() => api.addAlert(a.id), false)}
                      >
                        {inCase.has(a.id) ? "In case" : "Add to case"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="bench" aria-label="Case">
          {caseView && <ScorePanel summary={caseView.summary} empty={caseView.alerts.length === 0} />}

          <form className="policies" onSubmit={onApplyPolicies}>
            <label htmlFor="policy-input">Policies</label>
            <div className="policy-row">
              <input
                id="policy-input"
                value={policyInput}
                onChange={(e) => setPolicyInput(e.target.value)}
                placeholder="e.g. REPEAT_NOISE_DAMPING, CRITICAL_ASSET_BOOST"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn" disabled={busy}>
                Apply
              </button>
            </div>
            <div className="chips" role="group" aria-label="Insert a policy">
              {policyNames.map((p) => (
                <button
                  type="button"
                  key={p}
                  className="chip"
                  aria-pressed={typed.includes(p)}
                  onClick={() => togglePolicy(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="hint">
              Separate names with commas. Noise damping works with either escalation policy, but
              CRITICAL_ASSET_BOOST and APT_CAMPAIGN_LINK can't be used together.
              {pending && <strong className="pending"> Not applied yet.</strong>}
            </p>
            {error && (
              <div className="error" role="alert">
                <span>{error}</span>
                <button type="button" className="btn-text" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            )}
          </form>

          <div className="case">
            <div className="pane-head">
              <h2>In this case</h2>
              <span className="count">{caseView?.alerts.length ?? 0} alerts</span>
              {caseView && caseView.alerts.length > 0 && (
                <button className="btn-text push" disabled={busy} onClick={() => run(api.clearCase)}>
                  Clear case
                </button>
              )}
            </div>
            {caseView && caseView.alerts.length === 0 ? (
              <p className="empty">No alerts yet. Add alerts from the queue to score this case.</p>
            ) : (
              <ul className="rows">
                {caseView?.alerts.map((a) => (
                  <li key={a.id} className={ignored.has(a.id) ? "row row--ignored" : "row"}>
                    <AlertText
                      alert={a}
                      note={ignored.has(a.id) ? "Not counted: only the highest network scan counts" : undefined}
                      showCategory
                    />
                    <span className="row-score">{a.baseScore}</span>
                    <button
                      className="btn btn--small btn--quiet"
                      disabled={busy}
                      onClick={() => run(() => api.removeAlert(a.id), false)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AlertText({ alert, note, showCategory }: { alert: Alert; note?: string; showCategory?: boolean }) {
  return (
    <div className="row-text">
      <span className="row-title">{alert.title}</span>
      <span className="row-meta">
        {alert.sourceHost}
        {showCategory && <span className="row-cat">{CATEGORY_LABEL[alert.category]}</span>}
      </span>
      {note && <span className="row-note">{note}</span>}
    </div>
  );
}

function ScorePanel({ summary, empty }: { summary: ScoreSummary; empty: boolean }) {
  const band = summary.severity.toLowerCase();
  const steps = summary.adjustments.filter((a) => a.applied);
  const capCut = summary.finalScore - summary.uncappedScore;
  const rawPos = Math.min(summary.rawScore, 100);

  return (
    <div className={`score score--${band}`}>
      <div className="score-head">
        <span className="score-number" aria-label={`Final score ${summary.finalScore}`}>
          {summary.finalScore}
        </span>
        <span className="score-band">{summary.severity}</span>
      </div>

      <div className="ruler" aria-hidden="true">
        <div className="ruler-track">
          {BANDS.map((b) => (
            <div
              key={b.name}
              className={`ruler-band ruler-band--${b.name.toLowerCase()}${b.name === summary.severity ? " is-current" : ""}`}
              style={{ width: `${b.to - b.from}%` }}
            >
              <span className="ruler-label">
                {b.name} <span className="ruler-range">{b.from}–{b.name === "Critical" ? 100 : b.to - 1}</span>
              </span>
            </div>
          ))}
          {summary.rawScore !== summary.finalScore && (
            <span className="ruler-raw" style={{ left: `${rawPos}%` }} title={`Raw score ${summary.rawScore}`}>
              <span>raw {summary.rawScore}</span>
            </span>
          )}
          <span className="ruler-needle" style={{ left: `${summary.finalScore}%` }} />
        </div>
      </div>

      {empty ? (
        <p className="equation">Score starts at 0 until the case has alerts.</p>
      ) : (
        <p className="equation">
          <span className="term">
            <b>{summary.rawScore}</b> raw
          </span>
          {steps.map((s) => (
            <span className="term" key={s.policy}>
              <span className="op">{s.points < 0 ? "−" : "+"}</span>
              <b>{Math.abs(s.points)}</b> {POLICY_LABEL[s.policy]}
            </span>
          ))}
          {summary.capped && (
            <span className="term">
              <span className="op">−</span>
              <b>{Math.abs(capCut)}</b> cap at 100
            </span>
          )}
          <span className="term term--total">
            <span className="op">=</span>
            <b>{summary.finalScore}</b>
          </span>
        </p>
      )}

      {summary.adjustments.length > 0 && (
        <ul className="breakdown" aria-label="Adjustments">
          {summary.adjustments.map((adj) => (
            <li key={adj.policy} className={adj.applied ? "adj" : "adj adj--off"}>
              <span className="adj-name">{adj.policy}</span>
              <span className="adj-points">
                {adj.applied ? (adj.points > 0 ? `+${adj.points}` : `−${Math.abs(adj.points)}`) : "Not applied"}
              </span>
              <span className="adj-reason">{adj.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
