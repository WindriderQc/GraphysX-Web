# Making live sessions, leaderboards and ghosts reachable

The collaboration features ship in the production bundle and are correct. Until a store is
reachable from a visitor's browser, **none of them can be used by anyone arriving at the site**:
`main.ts` only probes a store when `?store=`, `?scene=`, `VITE_GRAPHYSX_STORE_URL` or dev mode
says one exists, and the deploy is static nginx with nothing behind it.

This is the gap between shipped and usable, and closing it is three steps.

## 1. Run the store, with a token

```bash
GRAPHYSX_STORE_TOKEN='<32+ random bytes>' \
GRAPHYSX_STORE_DIR=/var/lib/graphysx/scenes \
GRAPHYSX_STORE_PORT=8788 \
npm run serve:scenes
```

`GRAPHYSX_STORE_TOKEN` is not optional here. Without it the store runs in its tokenless LAN
mode, and **live sessions refuse to run at all** — they answer 503 rather than inherit a mode
where anyone who can reach the port can mint an owner credential. Scenes would still load, so
the failure looks like "collaboration is missing" rather than "the store is misconfigured".

`GRAPHYSX_STORE_ORIGIN` is unnecessary in the same-origin setup below and required if you ever
serve the store from a different hostname.

Systemd sketch — the point is `Restart=always` and the token coming from an environment file
that is not world-readable:

```ini
[Unit]
Description=GraphysX scene store
After=network-online.target

[Service]
WorkingDirectory=/opt/graphysx-web
EnvironmentFile=/etc/graphysx/store.env      # chmod 600, contains GRAPHYSX_STORE_TOKEN
ExecStart=/usr/bin/node server/scene-store.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Sessions are in-memory**, so a restart ends every live session. Authored work survives —
every accepted operation is already a stored scene revision — but members must rejoin. Results
and ghosts are on disk and survive.

## 2. Proxy it same-origin

The proxy block is already in `ops/nginx/graphysx.specialblend.ca` under `location /store/`.

Same-origin rather than a second hostname, for three reasons that each independently decide it:

- An `http://` store on an `https://` page is **blocked as mixed content** before any code
  runs. A store on a LAN address hits this immediately.
- A second hostname needs its own certificate and a CORS allowlist, and every mutating request
  pays a preflight.
- Under a path, `GRAPHYSX_STORE_ORIGIN` has nothing to allow, because nothing is cross-origin.

The three settings that matter and have no visible effect until someone actually collaborates:

```nginx
proxy_buffering off;          # or SSE returns 200 and then delivers nothing until close
proxy_set_header Connection "";
proxy_read_timeout 1h;        # or every session stream is severed once a minute
```

A buffered stream passes every status-code check. It is the failure this setup is most likely
to ship with, which is why the preflight below opens a real stream and times the first frame.

## 3. Point the build at it, then verify

```bash
node scripts/store-preflight.mjs --url https://graphysx.specialblend.ca/store --token "$GRAPHYSX_STORE_TOKEN"
```

Fix anything it reports before continuing. It checks scheme, reachability, that a token is
configured, that sessions are enabled, that an unauthenticated write is refused, and that the
event stream actually delivers.

Then build with the store baked in:

```bash
VITE_GRAPHYSX_STORE_URL=/store npm run build
```

In CI, set it as a repository variable and add it to the deploy workflow's build step:

```yaml
- name: Build production release
  env:
    VITE_GRAPHYSX_STORE_URL: ${{ vars.GRAPHYSX_STORE_URL }}
  run: npm run build
```

Unset, the build behaves exactly as it does today: no probe, no request, no console error. That
is the safe default and the reason this is opt-in.

## Who can do what, once it is live

| | Anonymous visitor | Token holder |
|---|---|---|
| Read scenes, leaderboards, ghosts | yes | yes |
| Race a rival's ghost | yes | yes |
| Record a time | no | yes |
| Write a scene | no | yes |
| Create a live session | no | yes |
| Join a session | with an invitation | with an invitation |

A browser gets a token through the `#storeToken=<token>` fragment, which is consumed once and
kept in `sessionStorage`. It is deliberately not in the query string: a query string is what
gets pasted, bookmarked and sent as a referrer.

A tokenless visitor is a first-class reader — boards and ghosts work — and simply does not post.
That is a capability check made before acting, not an error handled after: a 401 is logged to
the console by Chromium itself, before application code can catch it.

## Hosting a live session

```bash
# Owner authority is the store token; the session's own credentials do not exist yet.
curl -XPOST https://graphysx.specialblend.ca/store/sessions \
  -H "authorization: Bearer $GRAPHYSX_STORE_TOKEN" \
  -d '{"sceneName":"my-scene","owner":{"id":"ada","label":"Ada"}}'
# → { session, credential }   the credential is shown exactly once

curl -XPOST https://graphysx.specialblend.ca/store/sessions/$ID/invites \
  -H "x-graphysx-session: $CREDENTIAL" \
  -d '{"role":"editor","ttlSeconds":900}'
# → { invite, code }
```

Share `https://graphysx.specialblend.ca/?#session=<id>&invite=<code>`. The client exchanges the
code for a scoped credential and removes it from the address bar with `replaceState`.

For an agent, mint an invitation with `"role":"agent"` and an explicit `capabilities` array —
an agent invitation without one is refused at creation.

## Exposure this creates, stated plainly

Putting the store behind the public hostname makes these reachable from the internet:

- **Scene reads are open.** Anyone can list and read stored scenes. This was already true on the
  LAN; the boundary is now the internet. Do not store anything private in it.
- **Leaderboards and ghosts are open reads**, by design.
- **Rate limits are per member, not per IP.** A holder of a session credential is bounded; an
  unauthenticated flood of join attempts is bounded only by the invitation check. Put a
  `limit_req` zone in front if that matters.
- **`actorId` is self-reported.** The token says "allowed", not "who". There is no account
  system behind any of this.
- **Times are client-attested.** Validated for shape, consistency and plausibility; never
  replayed. The UI says so on every board.

Full threat model: `docs/LIVE_SESSIONS.md`. Results trust model: `docs/RESULTS.md`.
