# KidX on the Linux Mint touchscreen PC

The owner's Linux Mint PC replaces the planned Raspberry Pi target. The PC runs the browser
and, once selected and implemented, the local EV3 transport. First Drive still uses its existing
four blocks and steering runner. No real PC or EV3 hardware has been qualified yet.

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
