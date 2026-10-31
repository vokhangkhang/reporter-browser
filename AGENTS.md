# Reporter workspace instructions

- Read README.md and reporter.config.local.json (or REPORTER_CONFIG) before work. Do not assume any employee, PM host, project, sprint or report month.
- Platform baseline: Windows, Node 22+, installed Google Chrome. Use npm.cmd in PowerShell.
- Use local Playwright scripts for Chrome/PM. Do not use the integrated Browser plugin or build an MCP server for browser control.
- Preferred flow: user runs chrome:start in their terminal, keeps automation Chrome open; scripts attach to configured localhost CDP. chrome:check checks this automation endpoint.
- Never copy profiles, cookies, passwords or browser credential stores; never edit registry/native messaging or kill Chrome processes.
- Keep the dedicated automation profile at .local/chrome-automation. Never launch persistent automation against a personal Chrome directory. Personal attachment is optional and only through user-enabled CDP.
- Never close/navigate pre-existing tabs. Close only tabs created by the current command. Disconnect attached Chrome without terminating it. Do not launch another process against an already-open automation profile.
- PM is read-only unless the user explicitly authorizes changes. Prefer pm:sprints:ui rendered-page reads; do not replace them with direct PM API calls or token extraction. A title check does not establish authenticated project access.
- Slack and Drive are accessed through the current session's available connectors, not through the Node scripts. Discover/check tools before claiming access. Each user must connect their own accounts. Never send Slack messages without explicit authorization.
- Source links in config are routing hints, not credentials or proof of access. Follow permissions and record unavailable evidence rather than guessing.
- Read all relevant result pages and threads before marking source scope complete. Use docs/snapshots.md for normalized Slack/Drive inputs. Store only relevant private data in .local/.
- Distinguish date of work from posting date. Deduplicate repeated Today/Yesterday work across month boundaries. Preserve ambiguous/missing hours as unknown. Do not allocate grouped task IDs arbitrarily or assume all work has PM IDs.
- Keep all-sprint totals separate from daily references in a month. Point is the configured task custom field, not story points or hours. Missing point is unknown; an explicit zero is valid. Done requires exact configured status matching, not In Testing or Verified in Staging unless explicitly configured as accepted.
- Sprint dates and current assignee/status do not prove completion date or individual historical contribution. Whole-project progress needs delivery/acceptance evidence; selected sprints are not automatically the entire project. Do not infer overall completion percentages from stale planning sheets.
- PM snapshots before 0.2 lack scope metadata: recollect rather than relabel them as fresh. Never invent collectedAt or set complete:true for partial reads. pm:report rejects incomplete or mismatched snapshots.
- Reports write to .local/ by default. Do not write to PM or Drive as a side effect of collecting. When explicitly requested to create/update a Drive report, use the correct file/folder, preserve unrelated content and read back the result. Do not ask for authorization again if the request already clearly authorizes that write.
- Never commit .local/, reports/, local config, credentials, signed export URLs, profile data or raw channel dumps. Public examples must be fictional. Use share:check and share:prepare for a clean export; .gitignore alone does not sanitize history or forced adds.
- Run npm.cmd test, npm.cmd run demo and npm.cmd run share:check for reporting/sharing changes. Do not claim a live PM/Slack/Drive check when only fixtures or offline tests ran.
