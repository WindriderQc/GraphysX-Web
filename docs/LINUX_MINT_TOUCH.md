# KidX on the Linux Mint touchscreen PC

The owner's Linux Mint PC replaces the planned Raspberry Pi target. The PC runs the browser
and, once selected and implemented, the local EV3 transport. First Drive still uses its existing
four blocks and steering runner. Touch input has now been exercised on the real PC; complete
KidX acceptance and EV3 hardware qualification remain open.

## Live touch diagnosis (2026-09-10, resumed session)

**Current result:** after cleaning the screen, the owner confirms five successive physical
Menu open/close taps and all six fullscreen Firefox targets, including the lower-left corner.
Matched receipts confirm native touch across those zones. No calibration was applied.
KidX's three-Forward/Run/success/retry flow also passed by physical touch. The subsequent
long-press menu and chassis-heading corrections are now served and physically accepted.
Programs save/reload/open/replay also passed. Programs touch scrolling and keyboard focus
remain awaiting the owner's physical result. See "KidX acceptance and fresh-session handoff"
below.
The investigation below is chronological;
its earlier failed tests do not describe the latest result.

The owner confirmed physical interaction during a device-scoped XInput capture on ugKid.
The capture received **6 RawTouchBegin, 79 RawTouchUpdate and 6 RawTouchEnd events** from
device 6. The 45-second capture ended with the expected timeout status 124. The owner
observed text selection when dragging inside the terminal. The input path therefore reaches
X11 and an application; lack of visible reaction to other desktop taps does not establish
a broken kernel driver or justify recalibration.

A local diagnostic page was then opened in Firefox **155.0.1**, on the actual Mint desktop.
The owner confirmed that five finger taps advanced its counter and a traced line followed
the finger. Browser receipts recorded trusted pointer/click events, but their `pointerType`
was **mouse**. This confirms working compatibility input, not native browser touch handling
or touch scrolling in Programs.

Firefox was restarted with **session-only `MOZ_USE_XINPUT2=1`**. The live process environment
confirms the setting. Mozilla's [GTK startup implementation](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/xre/nsAppRunner.cpp)
uses this variable to control XInput2 multidevice support. No system environment, desktop
launcher, driver, calibration or browser preference was changed. **The repeat test now confirms
native `pointerType=touch`**: five trusted finger clicks and a trace with ten sampled points
arrived after the restart. The owner confirms this central Firefox probe works. Subsequent
wider-area testing below finds missed contacts in Firefox too; the whole touchscreen is not
qualified. Programs scrolling is still untested.

The diagnostic server runs on Windows loopback `127.0.0.1:4175`, through an SSH reverse
forward bound to ugKid loopback `127.0.0.1:4175`. Firefox opens
`http://127.0.0.1:4175/touch.html`. Its **Ouvrir KidX** link leads to the welcome page, served
from an isolated copy of the existing saved-program build with a passive diagnostic observer.
There is no public or LAN HTTP listener, production deployment or EV3 connection.
This temporary origin and server are for acceptance; saved programs remain origin-specific.

Local receipts, outside git:

- `output/mint-touch-2026-09-10/xinput-touch-01.log`: the scoped X11 event capture.
- `output/mint-touch-2026-09-10/unit-tests.log`: 293 passing tests, one existing Windows skip.
- `output/playwright/mint-touch/browser-receipts.jsonl`: browser environment and physical input.
- `output/playwright/mint-touch/browser-initial.png`: inspected Firefox trace and text selection.
- `output/playwright/mint-touch/browser-xinput2.png`: inspected page after the session-only restart.

**Next:** perform the actual-PC KidX checklist, including touch scrolling and held-Go release/cancellation.
The review and saved-program implementation are already complete.

### Earlier failures and the subsequent six-zone retest

The owner reports that touch still does not work in the Mint desktop and explicitly confirms
that a finger tap on the Mint Menu button does not open it. The same hardware reportedly worked
after installation of an older Mint version; that version and edition have not been identified.

The current versions are Cinnamon `6.6.9+zena`, Muffin `6.6.3+zena`,
`xserver-xorg-core 2:21.1.12-1ubuntu1.6`, and libinput `1.25.0-1ubuntu3.6`.
No Cinnamon extensions are enabled. The menu actor is visible and reactive at approximately
`x=0, y=1040, width=44, height=40` on the 1920x1080 screen. This is configuration evidence,
not a successful physical click.

A 45-second touchscreen-only XInput capture and temporary Cinnamon stage observer received
no events, but physical gestures during that window were not confirmed. That empty result is
**inconclusive**. A second bounded five-minute capture was armed at 18:48:38 EDT to compare
three taps on the Mint logo with one on the clock. The observer only retains LG touchscreen
touch/button events, always propagates them, and automatically disconnects at the deadline.
That second capture also remained empty. A later paired positive control below proves the
observer can receive the LG device's events. Neither empty capture establishes the failing layer.

An inspected actual-desktop screenshot, including the successful native Firefox touch probe,
is `output/playwright/mint-touch/mint-desktop.png`. Native browser input success does not
qualify Cinnamon's panel, its menus or KidX. No kernel, input driver or compositor replacement
has been attempted, and no regression cause is established yet.

#### Paired test and open-menu test

The next paired capture has a positive control: the owner advanced Firefox's counter to
11/5, and matching trusted native touch events appear in the browser receipts. XInput and
the temporary Cinnamon observer both received those contacts. The observer also sees Firefox
chrome contacts, so its earlier empty buffers are not evidence that it cannot receive events.
No matching bottom-panel contact was observed in this capture.

The Menu was then opened through Cinnamon's existing diagnostic D-Bus interface. The owner
reports that pressing entries does not activate them; only sliding changes the selected category.
In this phase, **Cinnamon does receive emulated button press/release events from the LG device**.
Recorded contacts around x=230..284, y=663..808 target the categories' `StScrollView`, while
direct actor picking at those positions resolves the visible, reactive category buttons.
This narrows the investigation to event targeting/activation in the desktop. It does not prove
the exact cause, and opening the menu remotely is not a successful physical Menu-button test.

To test for stale input state, the touchscreen was disabled and re-enabled once through XInput
(about 0.3 seconds, with re-enable in a `finally` block). Readback confirms Device Enabled=1,
identity calibration/coordinate matrices, and the original button map `1 2 3 4 5 6 7`.
The Menu was closed to restore the test's starting state. **The owner reports that the reset
did not fix the Menu button.** No persistent input configuration or Cinnamon source was changed.

Cinnamon was then restarted through its existing `RestartCinnamon(true)` D-Bus method.
Its diagnostic global disappeared, confirming re-execution; Firefox and the active X11 session
remained open, the touchscreen stayed enabled, and automatic locking stayed disabled.
The owner can now select categories, launch favorites and some application entries, but the
Mint Menu logo still does not open the menu. This is partial observed behavior, not a repair.

#### Edge trace and wider Firefox probe

The owner performed a slide toward the bottom-left logo and a tap. The XInput capture contains
three contacts: two short contacts, then a slide from approximately (344,476) to (31,1016).
There is no separate subsequent contact on the Menu logo at y=1040..1080. The capture was
explicitly stopped after the owner reported completion; its interrupted status is expected.
This warrants checking contact coverage, rather than assuming Cinnamon receives every failed tap.

A temporary fullscreen measurement page at `/measure.html` displays six targets and records
trusted touch coordinates anywhere on the page, so any touch can advance it. The first target
at (192,162) received (189,165), only three pixels off on each axis. The owner reports difficulty
activating Start and no response at the second target in the upper-right. The next contact,
which advanced the page to target 3, was at (564,341), not near target 2 at (1728,162).
It cannot be used as a calibration pair. The owner also reports Firefox's top menus work well.
Together these observations do not justify applying a global calibration matrix, and they
show the failure is not established as specific to Cinnamon.

A read-only evdev probe was run locally with administrator authentication. It verified the LG
identity and read axis ranges (X 0..1920, Y 0..1080, two slots), but its bounded capture contains
no events. Without a confirmed positive control within that window, the empty buffer does not
establish a kernel or hardware failure. No driver replacement or calibration was applied.
The owner subsequently disconnected only the display's USB cable for ten seconds and
reconnected it. XInput redetected the enabled LG device as id 6, `/dev/input/event6`, with
identity coordinate/calibration matrices. The owner still could not activate Start after
reconnection; the six-target retest did not complete.

#### Mini-keyboard touchpad comparison and kernel test

The owner uses a mini-keyboard with an integrated touchpad and reported a disappearing mouse
cursor. XInput identifies its pointer as `  mini keyboard Mouse`, id 8, `/dev/input/event3`,
enabled with identity coordinates and normal button state. Both devices share the virtual
core pointer. During a temporary touchscreen disable, the owner confirmed the touchpad worked;
its scoped XInput capture also recorded motion. The inverse test enabled touch and disabled
only the mini-keyboard's mouse function, leaving keyboard input available. The owner reports
that touchscreen behavior did not improve. This does not establish the mini-keyboard as the
cause. Both devices were re-enabled; the temporary helpers also completed their automatic restores.

The initial running kernel was `7.0.0-31-generic`. The installed `6.14.0-37-generic` kernel, its initramfs
and Nouveau module are present; the current graphics driver is Nouveau. SSH is enabled at boot.
A helper was prepared at `/tmp/kidx-boot-614.py` for the one-time boot comparison. It located
the actual existing non-recovery GRUB entry, refused an existing one-time selection, used
`grub-reboot`, verified the selection and rebooted after the owner's explicit approval. Its saved log confirms
the verified one-time selection and reboot, and SSH now reports **`6.14.0-37-generic`**.
The X11 session is active, the loopback acceptance tunnel is restored, and all three automatic
lock settings remain disabled. No kernel was installed or removed, and `GRUB_DEFAULT` was not
changed. The owner reports that the Menu still did not open under 6.14, while some drags
produced a cyan desktop selection rectangle and other areas remained unresponsive. The older
kernel did not resolve the reported fault; no 7.0-specific regression or repair is established.
The bounded capture had expired by the time this feedback arrived and contained no contacts;
there is no confirmed positive control within its capture window.

**Device ids changed on this boot:** the LG touchscreen is now XInput **8**, still
`/dev/input/event6`; the mini-keyboard mouse is **10**. Do not reuse the earlier XInput id 6,
which now identifies a Power Button. The touchscreen remains enabled with identity matrices.
Current receipts are `boot-614.log` and `kernel-614-inventory.log` under the local diagnostic
directory. The bounded remote touch capture is `/tmp/kidx-kernel614-touch.log`.

The monitor EDID now identifies the display as **Dell ST2220T**, manufacturer `DEL`, on DP-2.
Dell's [model specification](https://i.dell.com/images/emea/products/monitors/ST2220T_monitor_brochure_Ad_G10002992.pdf)
identifies optical touch technology. The [Dell user guide (mirrored text)](https://manualzilla.com/doc/7296771/dell-st2220t-user-s-guide)
describes three optical sensors, at the two upper corners and lower-left corner, requiring
clear views across the panel. It recommends keeping the rest of the hand clear when touching
and cautions against wiping the upper-corner optics when cleaning the glass.

The owner subsequently cleaned part of the screen and reports intermittent position errors
but also successfully opening the Mint Menu. The inspected screenshot
`output/playwright/mint-touch/touch-hud-614.png` shows the Menu open; it was not opened remotely
for that screenshot. Cleaning correlates with this improvement, but an obstruction or hardware
fault is not yet established and no calibration matrix was changed.

To make capture timing visible, a temporary non-reactive desktop counter displayed received
touch begins, ends and positions. `/tmp/kidx-visible-touch-probe.py` monitored only the identified
LG XInput device, with a ten-minute limit and capped rows. It did not record keyboard input or
alter input settings. The owner confirms that five successive finger taps reliably opened and
closed Menu with dry glass and the rest of the hand clear; the counter increased each time.
Balanced raw contacts at approximately x=15..18, y=1064..1066 support that report.

Firefox was restarted with session-only `MOZ_USE_XINPUT2=1` after cleaning. The owner then
confirmed touching only the centers of all six targets in fullscreen. Run
`2026-09-10T23:57:00.609Z` completed at `23:57:26.105Z`; all six samples are trusted native touch:

| Target | Expected pixels | Received pixels |
| --- | --- | --- |
| Upper left | 192, 162 | 193, 158 |
| Upper right | 1728, 162 | 1720, 163 |
| Lower right | 1728, 918 | 1729, 901 |
| Lower left | 192, 918 | 196, 929 |
| Lower center | 960, 702 | 960, 695 |
| Bottom-left edge | 38, 1058 | 17, 1064 |

This is successful coverage at 1920x1080 and device pixel ratio 1, not a precision calibration.
The varying small offsets do not justify a global matrix. The raw log was retained as
`output/mint-touch-2026-09-10/visible-touch-after-cleaning-final.jsonl`; the browser run is in
`output/playwright/mint-touch/browser-receipts.jsonl`. The diagnostic processes and overlay
were explicitly removed before opening KidX. No persistent Firefox launcher change was made;
the one-time kernel selection also leaves the normal boot default unchanged.
The touchscreen USB device reports power control `on` and runtime state `active`, so there is
no evidence here to justify changing its autosuspend settings.

Relevant local evidence: `xinput-firefox-menu-04.log`, `cinnamon-firefox-menu-04.json`,
`xinput-open-menu-05.log` and `xinput-reset-06.log` under
`output/mint-touch-2026-09-10/`, plus the inspected
`output/playwright/mint-touch/mint-menu-open.png` screenshot.
Further local receipts are `cinnamon-edge-08.json`, `xinput-edge-08.log` and
`evdev-touch-09.json` in the same diagnostic directory. The evdev result on ugKid is
`/tmp/kidx-raw-touch-845po5i5.json`. `output/playwright/mint-touch/measure-stalled.png`
shows the inspected upper-right target. The temporary Cinnamon observer is stopped; a later
probe revision observed only pointer/touch events, including virtual devices, never keyboard input.

### Automatic session locking disabled at the owner's request

The owner subsequently requested removal of automatic logoff. Live settings showed Cinnamon
automatic screen locking after 900 seconds, with automatic suspend already disabled. For user
`yb`, the following persistent settings were applied through the active user D-Bus session and
read back successfully:

- `org.cinnamon.desktop.screensaver lock-enabled`: `false` (previously `true`).
- `org.cinnamon.desktop.screensaver idle-activation-enabled`: `false` (previously `true`).
- `org.cinnamon.desktop.session idle-delay`: `uint32 0` (previously `uint32 900`).

The original values are retained on ugKid at
`/home/yb/.local/state/kidx/auto-lock-before-E0QcLJ.txt`. These changes disable the automatic
lock; they do not establish that a session logout was occurring. Display power settings were
not changed. Readback is the configuration receipt; no 15-minute idle soak has been performed.

## Earlier session handoff: access and initial inventory (2026-09-10)

The owner requested a fresh session at this point. SSH setup is complete: passwordless key
authentication from the Windows workstation to `yb@192.168.2.116` succeeds and returns
hostname `ugKid`. This is the repurposed old PC, not production UGFrank at `.99`.
The owner authorized access and touchscreen diagnosis; EV3 remains unplugged.

From Windows PowerShell, the verified connection is:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o IdentitiesOnly=yes -i C:/Users/Yanik/.ssh/id_ed25519 yb@192.168.2.116 hostname
```

The existing private key stays on Windows; do not print or copy it. The server ED25519
fingerprint was checked against the owner's installation photo before adding it to Windows
`known_hosts`: `SHA256:1EexzJWB6ZLzKS0TRrkxMKxFO/O2VYAsHRbmSeHjolQ`.
No SSH alias was configured. `sudo -n true` requires a password; privileged steps, if needed,
must use a concrete command the owner runs locally, without requesting a password in chat.

Live inventory and configuration:

| Item | Observed value |
| --- | --- |
| OS | Linux Mint 22.3 Zena, Cinnamon; kernel `7.0.0-31-generic` |
| Memory / GPU | `free -h`: 23 GiB total; NVIDIA GeForce GTX 1080 |
| Desktop | Active local X11 session `c1`, display `:0`, user `yb` |
| Display | One active screen, 1920 x 1080 at 60 Hz, primary output `DP-2`, normal orientation |
| Physical connection | Owner reports external HDMI display plus USB; exact display model remains unconfirmed |
| Touch USB | `1fd2:0064`, `LG Display LGD-MultiTouch` |
| Kernel driver | HID device `0003:1FD2:0064.0003` bound to `hid-multitouch` |
| Input classification | `/dev/input/event6`, `ID_INPUT_TOUCHSCREEN=1` |
| XInput | Device id `6`, direct touch, maximum two touches |
| Live configuration | Device Enabled = 1; send-events disabled mode off; coordinate and calibration matrices both identity |
| Diagnostic tools | `xinput`, `xrandr`, Python 3 present; `libinput` CLI and `evtest` absent |

At this earlier handoff, the kernel and desktop recognized and enabled the touchscreen.
That inventory alone did **not** establish that touching the panel generated events.
No interactive event capture had yet been performed,
and no driver, calibration, kernel or desktop setting was changed. Device ids and event paths
can change on reboot or reconnection; rediscover them before using the commands below.

**Original next action, now completed above:** coordinate a short tap-and-drag test with the owner while monitoring only
the identified touchscreen. The installed `xinput --help` confirms the syntax
`test-xi2 [--root] <device>`. As the desktop user, the intended remote command is:

```bash
timeout 30s env DISPLAY=:0 XAUTHORITY=/home/yb/.Xauthority stdbuf -oL xinput test-xi2 --root 6
```

Run that through SSH after confirming the current device id and that the owner is ready.
An empty capture without confirmed physical interaction is inconclusive. If events arrive,
check desktop response and browser input. If none arrive during confirmed touches, inspect
the specific raw input device and driver before choosing a fix. The raw event node currently
has no user ACL for `yb`, so raw capture may require a local privileged command.

After touch works, complete the actual-PC KidX acceptance below. Only then identify EV3
firmware, connection and motor wiring and implement the narrow transport adapter.
No EV3 motor test, application deployment, push or merge occurred during this setup.

The completed application work remains in local commits `e3dccae` (review corrections),
`9dc076f` (saved programs) and `6e0f6ab` (Mint target documentation). The saved-program full
gate passed 58/58 checks with zero retries; no product code changed afterward. Local detailed
reports remain in `output/peer-review-2026-09-10/REVIEW.fr.md`,
`output/review-fixes-2026-09-10/CLOSEOUT.fr.md` and
`output/playwright/kidx-saved-programs/DELIVERY.fr.md`.

## Identify the device before choosing a fix

Record the PC/display model, Mint version and edition, whether the display is integrated or
external, and its physical connections. Record whether touch ever worked on this hardware.
An external display's video connection and touch-data connection may be separate; check the
specific display manual once its model is known.

Run these read-only commands in a terminal **on the Mint desktop**:

```bash
cat /etc/linuxmint/info
uname -r
printf 'Session: %s\nDesktop: %s\n' "$XDG_SESSION_TYPE" "$XDG_CURRENT_DESKTOP"
lsusb
cat /proc/bus/input/devices
```

These establish the OS/kernel, session, USB inventory and kernel input inventory. A touchscreen
can also use an internal connection, so absence from `lsusb` alone is not a diagnosis.
Desktop session variables from an SSH shell can be empty and do not identify the local desktop.

If `libinput` is already available:

```bash
sudo libinput list-devices
```

Look for the touchscreen's device name, its `/dev/input/eventN` path and the `touch` capability.
This lists libinput's view and defaults; it does not report the desktop's live configuration.
If the command is missing, report that alongside the first outputs; package installation is
a separate step. See the [official libinput tool documentation](https://wayland.freedesktop.org/libinput/doc/latest/tools.html).

## Locate the failing layer

| Observation | Next investigation |
| --- | --- |
| No matching kernel input device | Verify the specific display connection and hardware identity, then inspect relevant HID/I2C/USB driver messages. |
| Kernel device exists but libinput does not list it | Inspect its udev input classification and libinput's diagnostic output. |
| libinput lists a touch device but receives no touch events | Test that specific input node and inspect its driver path. |
| Touch events arrive but the desktop does not respond correctly | Inspect the actual X11/Wayland desktop configuration, monitor assignment and orientation. |
| Desktop touch works but KidX does not | Inspect browser Pointer Events and the game's controls. |

Once the touchscreen event path has been identified, monitor **that device only** while touching
the screen for 15 seconds. Replace `eventN` with the observed path; do not use the example literally.

```bash
sudo timeout 15s libinput debug-events --device /dev/input/eventN
```

`timeout` normally returns status 124 when the observation period ends; that is not a failed
touch test. The relevant evidence is whether touch events arrived. Do not use a broad keyboard
or all-device recording for this investigation.

If kernel support becomes the identified issue, Mint's Update Manager is the supported place
to inspect available kernels. Record the installed kernel first and choose a change based on
the device and Mint version. See [Mint's kernel documentation](https://linuxmint-user-guide.readthedocs.io/en/latest/mintupdate.html#kernel-updates).

## Validate KidX on the actual PC

1. Verify taps and dragging in the Mint desktop and browser.
2. Record browser version, screen resolution, display scale and orientation.
3. Open First Drive from the welcome card. Verify all seven controls, including sustained
   Go input and release/cancellation in Drive mode.
4. Build three Forward blocks, Run, reach blue and retry. Test Left/Right routes as well.
5. Save a named program, reload, reopen it and run it again in the same browser profile/origin.
6. Open Programs, scroll the list by touch, edit a name, close it, and verify keyboard focus
   with Tab, Shift+Tab and Escape. Check the on-screen keyboard if the device requires one.
7. Record screenshots and actual results. Browser emulation on Windows does not close this
   Linux hardware acceptance step.

### KidX acceptance and fresh-session handoff (2026-09-10 evening EDT)

The owner requested a new session once desktop/browser touch worked. Keep the established
touch result above and resume application work, rather than repeating the kernel/calibration
investigation.

- **Passed on ugKid:** trusted finger activation of the welcome card's KidX entry, three
  Forward blocks, Run, blue-target success and Try again. Receipts at
  `2026-09-11T00:02:22Z` through `00:02:36Z` confirm all these transitions; retry restores
  position `[0,0.83,17]`, heading 0 and pause. Firefox 155.0.1 uses a 1920x922 viewport on the
  1920x1080 display at scale 1. A preliminary two-Forward run also succeeded; it is distinct
  from the requested three-block test.
- **Drive long press corrected and physically accepted:** the owner reported a submenu
  appearing while holding a control. `kidx-long-press-menu.png` shows selected button text
  after the menu was dismissed. Native cancellations and releases did stop the rover in
  recorded intervals, but this does not qualify sustained driving. Held buttons now use
  `touch-action:none`, disable text selection and prevent `contextmenu`; non-primary mouse
  presses do not start driving. The CSS applies before contact, since changing touch-action
  during a gesture is too late. Programs retains native scrolling and name editing. See
  [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)
  and [contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event).
  The focused EV3 smoke now passes a native touch hold, slide outside, release-to-stop and
  trusted context-menu scope checks. The required game client also passes; screenshots were
  inspected and console/page errors are empty. These are Windows Chromium results; the
  rover-only build `e77158b` was then served to ugKid. The owner confirms sustained holds, sliding outside
  and release-to-stop, with no browser menu or selection. Trusted native Firefox receipts at
  `2026-09-11T00:21:34Z` through `00:22:16Z` confirm canceled context menus, Go success and retry
  to heading 0 with zero velocity. Held visual
  state and pointer ownership also clear at success, retry and disposal; a late release from
  a retired hold cannot stop the next input.
- **Chassis heading corrected in scene composition:** rover revision `e77158b` put the visible
  chassis and its children under the existing steering root, with physical Left/Right rotation
  confirmed on ugKid. The integrated workbench now uses a heading group at lift 0 for the EV3
  model and its direction cone. The dynamic collider and forces are unchanged. No host-only
  mutation or shared BallZ steering change is involved. The combined smoke measures actual
  rendered model and marker directions on both turn routes, repeatability and north reset.
  This newer representation requires its own browser and physical acceptance; see `KIDX_VISUALS.md`.
- **Programs save/reload/open/replay passed:** the owner saved the three-Forward program as
  `forward`, reloaded Firefox, opened it and ran it to blue. Matched browser sessions and the
  success receipt at `2026-09-11T00:23:20Z` confirm the saved name, all three blocks and a
  1.764-second mission completion. This is the same temporary origin and Firefox profile.
- **Still pending on the PC:** acceptance of the integrated workbench, remaining block controls/routes, touch scrolling,
  repeated name editing/copying and Tab/Shift+Tab/Escape focus behavior. The final physical
  scroll/focus exercise has been requested; no confirmation or matching new receipts have
  arrived yet. Automated coverage is green but does not close these physical items.
  The mini-keyboard is available; an
  on-screen keyboard is not yet a requirement. EV3 remains unplugged and unqualified.

The latest correction is in the isolated worktree branch `codex/kidx-mint-rover`, based on
`codex/kidx-linux-mint` at `f3d9f52`. A new Firefox tab opens
`http://127.0.0.1:4175/?app=ev3-lab&acceptance=rover-hold` on ugKid. The server on 4175 now uses
`C:\Users\Yanik\.codex\worktrees\ab67\GraphysX-Web\output\playwright\mint-rover\serve.mjs`.
Its isolated `site/`, `served-build.json`, passive browser receipts and actual-Mint captures
are alongside it. The source hash and index hash were read back through ugKid's tunnel.
Earlier diagnostic artifacts remain in the original checkout at
`C:\Users\Yanik\codes\GraphysX-Web\output\playwright\mint-touch\`.
Do not assume that checkout's `dist/` follows a worktree build.
Rediscover the server/tunnel processes before restarting them. The SSH reverse listener is
loopback-only on both machines; user authorization for ugKid access persists.

Long-press correction validation is in `output/mint-touch-2026-09-10/` (build-hold-fix.log,
smoke-hold-fix.log, client-hold-fix.log) and `output/playwright/mint-hold-fix/` (screenshots and
client state). The follow-up worktree's `output/mint-rover/` contains check/build/lint/smoke
and client logs. Typecheck, 293 unit tests (one existing skip), build, targeted lint, the full
focused EV3 smoke and game client pass. The Go regression assertion checks the detached button
before pointer-up and idle controls after retry. Final full-gate status is recorded in the
latest progress entry: **all 58 checks passed with zero retries**. This was the single final
full gate after the corrections, including 293 unit passes (one existing skip), typecheck,
lint, build, both KidX smokes, BallZ and the 131/131 two-browser collaboration checks.
The Programs smoke took 8m12s of its unchanged 10-minute deadline, producing a headroom
warning rather than a failure. No assertion or deadline was relaxed. The 436 files in the
isolated served site match the full-gate build byte-for-byte (`served-copy-check.json`).

Current boot remains the one-time 6.14 kernel, and Firefox's XInput2 variable is session-only.
No permanent kernel default, calibration, Firefox launcher or graphics-driver change was made.
Automatic locking remains persistently disabled. Saved programs are scoped to the temporary
origin; no application deployment, push, merge or EV3 motor test occurred.

## EV3 transport boundary

Before implementation, identify the brick firmware (stock LEGO, ev3dev or another environment),
USB/Bluetooth/network connection, and the two drive motors' ports and polarity. These determine
the transport and motor commands; no ports or firmware are assumed by this project yet.
For example, [ev3dev uses its own operating system and supports network/SSH access](https://www.ev3dev.org/docs/getting-started/);
that is not evidence that this particular brick runs ev3dev.

The adapter must consume the existing block sequence. Motor timing and turn calibration need
real measurements; the simulator's time-to-distance relationship is not a hardware calibration.
Physical runs need explicit start/stop behavior and a bounded stop on transport failure. A local
unit test of a transport cannot be reported as a successful run on the robot.
