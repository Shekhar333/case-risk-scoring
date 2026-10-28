import type { Alert } from "./types.js";

export const SEED_ALERTS: Alert[] = [
  { id: 1, title: "Credential harvesting email sent to finance team", category: "phishing", sourceHost: "mail-gw-01", baseScore: 18 },
  { id: 2, title: "Malicious macro attachment opened (invoice.docm)", category: "phishing", sourceHost: "wks-fin-07", baseScore: 26 },
  { id: 3, title: "Emotet loader detected in user temp directory", category: "malware", sourceHost: "wks-fin-07", baseScore: 34 },
  { id: 4, title: "Ransomware precursor: shadow copy deletion", category: "malware", sourceHost: "srv-file-02", baseScore: 40 },
  { id: 5, title: "TCP port scan from internal workstation", category: "network_scan", sourceHost: "wks-eng-12", baseScore: 12 },
  { id: 6, title: "SMB sweep across 10.0.4.0/24", category: "network_scan", sourceHost: "wks-eng-12", baseScore: 15 },
  { id: 7, title: "Repeated SYN scan against DMZ", category: "network_scan", sourceHost: "fw-edge-01", baseScore: 8 },
  { id: 8, title: "Port scan targeting domain controller", category: "network_scan", sourceHost: "srv-dc-01", baseScore: 22 },
  { id: 9, title: "LSASS memory read by unsigned process", category: "credential_access", sourceHost: "srv-dc-01", baseScore: 38 },
  { id: 10, title: "Brute-force login attempts on VPN gateway", category: "credential_access", sourceHost: "vpn-gw-01", baseScore: 20 },
  { id: 11, title: "Kerberoasting: anomalous TGS ticket requests", category: "credential_access", sourceHost: "srv-dc-01", baseScore: 30 },
];
