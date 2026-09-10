# KidX on the Linux Mint touchscreen PC

The owner's Linux Mint PC replaces the planned Raspberry Pi target. The PC runs the browser
and, once selected and implemented, the local EV3 transport. First Drive still uses its existing
four blocks and steering runner. No real PC or EV3 hardware has been qualified yet.

## Session handoff: verified access, touch still unresolved (2026-09-10)

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

The kernel and desktop recognize and enable the touchscreen. This does **not** establish
that touching the panel generates events. No interactive event capture has been performed,
and no driver, calibration, kernel or desktop setting was changed. Device ids and event paths
can change on reboot or reconnection; rediscover them before using the commands below.

**Next action:** coordinate a short tap-and-drag test with the owner while monitoring only
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
