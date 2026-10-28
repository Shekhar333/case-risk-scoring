# Prompts used

Tools: Claude Code (Claude Opus 5.5) for the build. Codex (GPT 6.1 Sol, high reasoning) ran one independent review, delegated from Claude Code.
Prompts are listed verbatim, in order, with times in IST; two account-setup messages are omitted.

| # | Time | Prompt |
| - | ---- | ------ |
| 1 | 09:51 | *(attached the assessment PDF `SE_ENGINEERING_ASSESSMENT_2.pdf`)* "i need to fully build this, this is for an assessment" |
| 2 | 10:01 | "run it" |
| 3 | 10:03 | "using subagents verify the work using gpt 6.1 sol high and only send the pdf to that subagent no additional info and verify if all the specs are matched as per the pdf and verified by sol" |
| 4 | 10:05 | "for each point in the pdf, prepare a new pdf which shows screenshot of what you did for that particular point" |
| 5 | 10:12 | "continue" |
| 6 | 10:18 | "what about gpt status>" |
| 7 | 10:20 | "using the frontend design skill by claude, fix the ui of this app" |
| 8 | 10:28 | "what were the left out requirements which i need to do?" |
| 9 | 10:39 | "i need to open it the link in the t3 browser" |
| 10 | 10:40 | "it failed i think try again" |
| 11 | 10:41 | "done" |
| 12 | 10:42 | *(ran the `/usage` command)* |
| 13 | 10:43 | "i need the exact tokens consumed" |
| 14 | 10:45 | "fill the submission.md with the latest details, mark this as the last message" |
