import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Alert, CaseView, ScoreSummary } from "../../server/src/types";
import { api } from "./api";

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

  const inCase = new Set(caseView?.alerts.map((a) => a.id));
  const ignored = new Set(caseView?.summary.ignoredAlertIds);

  return (
    <main>
      <header>
        <h1>Incident Case Risk Scoring</h1>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="layout">
        <section>
          <h2>Available alerts</h2>
          <AlertTable
            alerts={alerts}
            action={(a) => (
              <button disabled={busy || inCase.has(a.id)} onClick={() => run(() => api.addAlert(a.id), false)}>
                {inCase.has(a.id) ? "In case" : "Add to case"}
              </button>
            )}
          />
        </section>

        <section>
          <div className="section-head">
            <h2>Case ({caseView?.alerts.length ?? 0} alerts)</h2>
            {caseView && caseView.alerts.length > 0 && (
              <button className="secondary" disabled={busy} onClick={() => run(api.clearCase)}>
                Clear case
              </button>
            )}
          </div>
          {caseView && caseView.alerts.length === 0 ? (
            <p className="muted">No alerts in the case yet. Add some from the list.</p>
          ) : (
            <AlertTable
              alerts={caseView?.alerts ?? []}
              rowClass={(a) => (ignored.has(a.id) ? "ignored" : undefined)}
              note={(a) => (ignored.has(a.id) ? "ignored by damping" : undefined)}
              action={(a) => (
                <button disabled={busy} onClick={() => run(() => api.removeAlert(a.id), false)}>
                  Remove
                </button>
              )}
            />
          )}

          <h2>Policies</h2>
          <form onSubmit={onApplyPolicies} className="policy-form">
            <input
              aria-label="Policies"
              value={policyInput}
              onChange={(e) => setPolicyInput(e.target.value)}
              placeholder="e.g. REPEAT_NOISE_DAMPING, CRITICAL_ASSET_BOOST"
            />
            <button type="submit" disabled={busy}>
              Apply
            </button>
          </form>
          <p className="muted small">
            Comma-separated. Valid: {policyNames.join(", ")}. Only one of CRITICAL_ASSET_BOOST /
            APT_CAMPAIGN_LINK at a time. Active: <strong>{caseView?.policies.join(", ") || "none"}</strong>
          </p>

          <h2>Score summary</h2>
          {caseView && <Summary summary={caseView.summary} />}
        </section>
      </div>
    </main>
  );
}

function AlertTable(props: {
  alerts: Alert[];
  action: (a: Alert) => ReactNode;
  rowClass?: (a: Alert) => string | undefined;
  note?: (a: Alert) => string | undefined;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Host</th>
          <th className="num">Score</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {props.alerts.map((a) => (
          <tr key={a.id} className={props.rowClass?.(a)}>
            <td>
              {a.title}
              {props.note?.(a) && <div className="small muted">{props.note(a)}</div>}
            </td>
            <td>
              <span className={`tag ${a.category}`}>{a.category}</span>
            </td>
            <td className="mono">{a.sourceHost}</td>
            <td className="num">{a.baseScore}</td>
            <td className="actions">{props.action(a)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ summary }: { summary: ScoreSummary }) {
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <div className="summary">
      <table>
        <tbody>
          <tr>
            <th>Raw score</th>
            <td className="num">{summary.rawScore}</td>
          </tr>
          {summary.adjustments.map((adj) => (
            <tr key={adj.policy} className={adj.applied ? undefined : "not-applied"}>
              <th>
                {adj.policy}
                <div className="small muted">{adj.reason}</div>
              </th>
              <td className="num">{adj.applied ? signed(adj.points) : "not applied"}</td>
            </tr>
          ))}
          {summary.capped && (
            <tr>
              <th>
                Cap at 100
                <div className="small muted">Score before cap: {summary.uncappedScore}</div>
              </th>
              <td className="num">{signed(summary.finalScore - summary.uncappedScore)}</td>
            </tr>
          )}
          <tr className="total">
            <th>Final score</th>
            <td className="num">{summary.finalScore}</td>
          </tr>
        </tbody>
      </table>
      <div className={`severity ${summary.severity.toLowerCase()}`}>{summary.severity}</div>
    </div>
  );
}
