import {
  ESCALATION_POLICIES,
  POLICY_NAMES,
  type Adjustment,
  type Alert,
  type PolicyName,
  type ScoreSummary,
  type Severity,
} from "./types.js";

export const MAX_SCORE = 100;
export const BOOST_PERCENT = 20;
export const BOOST_CAP = 30;
export const APT_POINTS = 25;
export const APT_MIN_SCORE = 50;

export class PolicyValidationError extends Error {}

/**
 * Parses free-text policy input ("repeat_noise_damping, APT_CAMPAIGN_LINK") or an array of names.
 * Names are trimmed, upper-cased and de-duplicated. Unknown names and more than one
 * escalation policy are rejected. Output is in canonical evaluation order.
 */
export function parsePolicies(input: unknown): PolicyName[] {
  let tokens: string[];
  if (typeof input === "string") {
    tokens = input.split(/[\s,]+/);
  } else if (Array.isArray(input) && input.every((p) => typeof p === "string")) {
    tokens = input as string[];
  } else {
    throw new PolicyValidationError("policies must be a string or an array of strings");
  }

  const names = new Set(tokens.map((t) => t.trim().toUpperCase()).filter(Boolean));

  const unknown = [...names].filter((n) => !(POLICY_NAMES as readonly string[]).includes(n));
  if (unknown.length > 0) {
    throw new PolicyValidationError(
      `Unknown policy: ${unknown.join(", ")}. Valid policies: ${POLICY_NAMES.join(", ")}`,
    );
  }

  const escalations = ESCALATION_POLICIES.filter((p) => names.has(p));
  if (escalations.length > 1) {
    throw new PolicyValidationError(
      `Only one escalation policy can be active at a time (got ${escalations.join(" and ")})`,
    );
  }

  return POLICY_NAMES.filter((p) => names.has(p));
}

export function severityFor(score: number): Severity {
  if (score >= 85) return "Critical";
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

/**
 * Scores a case. Pure function: the summary is always derived from the current alerts and
 * policies, never stored, so it stays correct when the case changes.
 *
 * Order of evaluation:
 *   1. Raw score = sum of base scores.
 *   2. REPEAT_NOISE_DAMPING (if active) removes all but the highest network_scan alert.
 *   3. The escalation policy (if any) is evaluated against the damped score.
 *   4. The final score is capped at 100 and mapped to a severity band.
 */
export function scoreCase(alerts: readonly Alert[], policies: readonly PolicyName[]): ScoreSummary {
  const rawScore = alerts.reduce((sum, a) => sum + a.baseScore, 0);
  const adjustments: Adjustment[] = [];
  const ignoredAlertIds: number[] = [];
  let score = rawScore;

  if (policies.includes("REPEAT_NOISE_DAMPING")) {
    const scans = alerts
      .filter((a) => a.category === "network_scan")
      .sort((a, b) => b.baseScore - a.baseScore || a.id - b.id);
    const [kept, ...dropped] = scans;
    const removed = dropped.reduce((sum, a) => sum + a.baseScore, 0);
    ignoredAlertIds.push(...dropped.map((a) => a.id));

    adjustments.push({
      policy: "REPEAT_NOISE_DAMPING",
      applied: dropped.length > 0,
      points: removed > 0 ? -removed : 0, // avoid -0
      scoreBefore: score,
      scoreAfter: score - removed,
      reason:
        dropped.length > 0
          ? `Kept highest network_scan alert "${kept.title}" (${kept.baseScore}); ignored ${dropped.length} other network_scan alert(s)`
          : `No effect: ${scans.length} network_scan alert(s) in case, nothing to damp`,
    });
    score -= removed;
  }

  if (policies.includes("CRITICAL_ASSET_BOOST")) {
    // Integer arithmetic so flooring is exact (score * 0.2 can produce float error).
    const percentBoost = Math.floor((score * BOOST_PERCENT) / 100);
    const boost = Math.min(percentBoost, BOOST_CAP);
    adjustments.push({
      policy: "CRITICAL_ASSET_BOOST",
      applied: boost > 0,
      points: boost,
      scoreBefore: score,
      scoreAfter: score + boost,
      reason:
        boost === 0
          ? "No effect: 20% of current score rounds down to 0"
          : percentBoost > BOOST_CAP
            ? `+20% of ${score} = ${percentBoost}, capped at ${BOOST_CAP}`
            : `+20% of ${score}, rounded down`,
    });
    score += boost;
  }

  if (policies.includes("APT_CAMPAIGN_LINK")) {
    const qualifies = score >= APT_MIN_SCORE;
    const points = qualifies ? APT_POINTS : 0;
    adjustments.push({
      policy: "APT_CAMPAIGN_LINK",
      applied: qualifies,
      points,
      scoreBefore: score,
      scoreAfter: score + points,
      reason: qualifies
        ? `+${APT_POINTS} flat: score ${score} is at least ${APT_MIN_SCORE}`
        : `Not applied: requires a score of at least ${APT_MIN_SCORE} before the boost (currently ${score})`,
    });
    score += points;
  }

  const finalScore = Math.min(score, MAX_SCORE);
  return {
    rawScore,
    adjustments,
    uncappedScore: score,
    finalScore,
    capped: score > MAX_SCORE,
    severity: severityFor(finalScore),
    ignoredAlertIds,
  };
}
