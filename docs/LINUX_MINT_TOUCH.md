# KidX on the Linux Mint touchscreen PC

The owner's Linux Mint PC replaces the planned Raspberry Pi target. The PC runs the browser
and, once selected and implemented, the local EV3 transport. First Drive still uses its existing
four blocks and steering runner. Touch input has now been exercised on the real PC; complete
KidX acceptance and EV3 hardware qualification remain open.

## Live touch diagnosis (2026-09-10, resumed session)

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

**Next:** resolve the remaining Cinnamon desktop input issue described below, then perform
the actual-PC KidX checklist, including touch scrolling and held-Go release/cancellation.
The review and saved-program implementation are already complete.

### Central Firefox input works; wider touch reliability remains unresolved

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

#### Mini-keyboard touchpad comparison and next kernel test

The owner uses a mini-keyboard with an integrated touchpad and reported a disappearing mouse
cursor. XInput identifies its pointer as `  mini keyboard Mouse`, id 8, `/dev/input/event3`,
enabled with identity coordinates and normal button state. Both devices share the virtual
core pointer. During a temporary touchscreen disable, the owner confirmed the touchpad worked;
its scoped XInput capture also recorded motion. The inverse test enabled touch and disabled
only the mini-keyboard's mouse function, leaving keyboard input available. The owner reports
that touchscreen behavior did not improve. This does not establish the mini-keyboard as the
cause. Both devices were re-enabled; the temporary helpers also completed their automatic restores.

The running kernel is `7.0.0-31-generic`. The installed `6.14.0-37-generic` kernel, its initramfs
and Nouveau module are present; the current graphics driver is Nouveau. SSH is enabled at boot.
A helper at `/tmp/kidx-boot-614.py` is prepared for an owner-approved, one-time boot comparison.
It locates the actual existing non-recovery GRUB entry, refuses an existing one-time selection,
uses `grub-reboot`, verifies the selection and only then reboots. Syntax was checked, but the
helper has **not been executed**. Reboot confirmation is pending because it closes the Mint session.
No kernel was installed, removed or selected yet; no kernel regression is established.

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
