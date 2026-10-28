# Submission notes

## 1. Prompts used

Tool: Claude Code (model: Claude Opus 5.5).

| # | Prompt |
| - | ------ |
| 1 | *(attached the assessment PDF `SE_ENGINEERING_ASSESSMENT_2.pdf`)* "i need to fully build this, this is for an assessment" |

<!-- Add any follow-up prompts here, verbatim, in order. -->

## 2. Build time

| | |
| - | - |
| Start (first prompt) | 2026-10-28 09:52 IST |
| Working app (tests green, Docker image verified) | 2026-10-28 09:58 IST |
| End (README + submission docs) | _fill in_ |
| Total | _fill in_ |

## 3. Tokens consumed

_Run `/cost` in Claude Code at the end of the session and paste it here._

| Input tokens | Output tokens | Total cost |
| ------------ | ------------- | ---------- |
| _fill in_    | _fill in_     | _fill in_  |

## 4. Where the AI got something wrong or needed correction

- **`-0` in the damping adjustment.** The first version wrote `points: -removed`. When nothing was damped this produced `-0`, which failed a `toMatchObject({ points: 0 })` test. Changed it to `removed > 0 ? -removed : 0`. JSON hides this (`-0` serialises as `0`), but code that branches on the value could still be affected.
- **The SPA fallback returned 500 in production.** `res.sendFile(path.join(dir, "index.html"))` puts the whole absolute path through `send`'s "ignore dotfiles" check. The project sat under `~/.t3/…`, so every deep link failed. The unit tests did not catch it because they do not serve static files. The production smoke test did. Fixed by using `res.sendFile("index.html", { root: dir })`, which checks only the relative part.
- **The client typecheck failed on `import "./styles.css"`.** The generated client had no `vite/client` type reference. Added `client/src/vite-env.d.ts`.
- **The Docker build failed on `npm ci`.** `better-sqlite3` has no prebuilt binary for linux/arm64 on this Node version, and `node:22-slim` has no compiler. Added `python3 make g++` to the *build* stage only, which keeps the runtime image slim.
- **I checked one domain interpretation by hand rather than accepting the default:** what "at least 50 before the boost" means for APT_CAMPAIGN_LINK. I chose "after noise damping" and pinned it with a test (raw 55 → damped 45 → APT not applied). The reasoning is in the README.
