# Staging on UGBrutal

Optional LAN release target for GraphysX Web. The workflow is **manual only**
(`workflow_dispatch`); a branch push does not publish here. It requires a registered
`[self-hosted, ugbrutal]` runner and the persistent staging server below.

For ordinary local development, use `npm run dev`. To inspect `dist/`, use
`npm run build` then `npm run preview`. Neither requires a scheduled task, firewall change
or self-hosted runner. The staging setup below is for retained, manually published releases.

| | |
| --- | --- |
| Host | UGBrutal — `192.168.2.12` |
| Staging URL | <http://192.168.2.12:8099/> |
| Release root | `C:\graphysx-staging` |
| Workflow | [`.github/workflows/staging.yml`](../.github/workflows/staging.yml) |

## Layout

```
C:\graphysx-staging\
  releases\<sha>\index.html   published builds (two most recent kept)
  current.txt                 one line: the active release directory name
```

`scripts/staging-server.mjs` re-reads `current.txt` per request, so publishing a release
is an atomic pointer flip — the server never needs restarting.

## One-time setup

### 1. Staging server as a background service

Run it once to confirm, then register it so it survives reboot:

```powershell
npm run serve:staging          # foreground check -> http://192.168.2.12:8099/
```

```powershell
# Persistent: run at boot as the logged-in user.
$action  = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "scripts\staging-server.mjs" -WorkingDirectory "C:\Users\Yanik\codes\GraphysX-Web"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "GraphysX Staging Server" -Action $action -Trigger $trigger `
  -RunLevel Highest -Description "Serves C:\graphysx-staging on :8099"
```

If the LAN cannot reach port 8099, allow it once (elevated):

```powershell
New-NetFirewallRule -DisplayName "GraphysX staging 8099" -Direction Inbound `
  -Protocol TCP -LocalPort 8099 -Action Allow -Profile Private
```

### 2. GitHub Actions self-hosted runner

The staging workflow targets `runs-on: [self-hosted, ugbrutal]`. Until a runner with
those labels is registered, manually requested staging jobs queue instead of running.

Get a registration token (valid one hour):

```powershell
gh api -X POST repos/WindriderQc/GraphysX-Web/actions/runners/registration-token --jq .token
```

Then install the runner (run the configure step from an **elevated** PowerShell so it can
install the service):

```powershell
mkdir C:\actions-runner; cd C:\actions-runner
# Download the current windows-x64 runner package from:
#   https://github.com/actions/runner/releases
# then:
.\config.cmd --url https://github.com/WindriderQc/GraphysX-Web `
             --token <TOKEN> --labels ugbrutal --unattended --runasservice
```

Verify it appears as idle:

```powershell
gh api repos/WindriderQc/GraphysX-Web/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

## Security note

A self-hosted runner executes workflow code from the repository on this machine. Keep the
repository private, or disable Actions for forked pull requests — otherwise a fork's PR can
run arbitrary code on UGBrutal.

## Promotion path

```
branch push  ->  CI (ubuntu)          full release gate; no staging publication
manual run  ->  Staging (UGBrutal)   full gate, publish to :8099, check published page
push to main ->  CI gate              must pass
             ->  Deploy               atomic release to graphysx.specialblend.ca
```

The published-page check skips build and checks requiring an isolated local store; it
complements the full prepublication gate. Staging retains its release pointer, scheduled
server and two-release retention. It does not deploy the optional scene-store server.
