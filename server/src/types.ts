// Shared domain types. The client imports these as type-only imports.

export const CATEGORIES = ["phishing", "malware", "network_scan", "credential_access"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Alert {
  id: number;
  title: string;
  category: Category;
  sourceHost: string;
  baseScore: number; // integer, 1..40
}

export const POLICY_NAMES = ["REPEAT_NOISE_DAMPING", "CRITICAL_ASSET_BOOST", "APT_CAMPAIGN_LINK"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

/** Escalation policies are mutually exclusive: at most one may be active. */
export const ESCALATION_POLICIES: readonly PolicyName[] = ["CRITICAL_ASSET_BOOST", "APT_CAMPAIGN_LINK"];

export type Severity = "Low" | "Medium" | "High" | "Critical";

/** One line in the score breakdown. `points` is the signed change this step made. */
export interface Adjustment {
  policy: PolicyName;
  applied: boolean;
  points: number;
  scoreBefore: number;
  scoreAfter: number;
  reason: string;
}

export interface ScoreSummary {
  rawScore: number;
  adjustments: Adjustment[];
  /** Score after all policies, before the 100 cap. */
  uncappedScore: number;
  finalScore: number;
  capped: boolean;
  severity: Severity;
  /** Alerts in the case that did not count towards the score (e.g. damped network scans). */
  ignoredAlertIds: number[];
}

export interface CaseView {
  id: number;
  alerts: Alert[];
  policies: PolicyName[];
  summary: ScoreSummary;
}
