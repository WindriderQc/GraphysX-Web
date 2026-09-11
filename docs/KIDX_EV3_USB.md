# KidX EV3 USB adapter

Local development only. The connected brick is a LEGO EV3 running **V1.09H**, serial
`00165362f404`, with large motors on **B/C**. Both motors are separate from the chassis.
The owner explicitly deferred mounting direction; polarity remains configurable, not
qualified. One supervised B-only +20% / 250 ms pulse was acknowledged and the owner
observed its stop. Compiled **Forward -> Stop** and **Left -> Right -> Stop** now run on both
motors, with motion, inversion and stopping confirmed by the owner. A deliberate controller
process exit while the motors were busy also ended with their observed autonomous stop.
Chassis direction, turn angles and measured stopping latency remain unqualified.

## Shared program and narrow transport

`tools/ev3-compile.mjs` collects timed inputs from the existing DOM-free
`createEv3FirstProgramRunner`. It neither duplicates the block table nor changes the browser
runner. JSON contains ordered `durationMs` and `{ thrust, turn }` values. Forward, Left,
Right and Stop retain their durations and six-block limit. There is no second language,
generic application framework, browser service or HTTP motor endpoint.

`tools/ev3_usb.py` consumes this sequence on Linux using Python's standard library. Positive
turn maps to left-forward/right-backward before applying each motor's explicit polarity.
The adapter accepts only B/C large motors and caps power at 20% for this initial bench stage.
It normalizes brick motor polarity to positive at execution start, leaving the command-line
polarity as the single direction adjustment.

Motion is divided into **at most 250 ms** `OUTPUT_TIME_POWER` operations with braking,
executed by the brick. Both motor operations share one USB command. The host waits for the
commanded duration and an idle response before sending another chunk. It never uploads a
queued whole program or uses unbounded `OUTPUT_START`. A missing acknowledgment aborts
without retrying motion. Completion, Ctrl+C, SIGTERM and SIGHUP attempt a braked stop.
Abrupt process loss or USB removal leaves only the current timed chunk on the brick.

This bounds commanded duration, **not measured physical stopping time**. Acknowledgments
and busy flags cannot prove a route or mechanical stop. Brake/USB gaps make elapsed time
longer than the nominal compiled duration and may make motion uneven. Chassis direction,
timing, turn angle, USB unplug and full host-power-loss behavior remain unqualified. The
controller-process-loss case below has been exercised on the connected brick.

## Commands

Compile on the development PC with the repository's Node runtime:

```powershell
node tools/ev3-compile.mjs forward left right stop --out output/ev3-usb/compiled-four-blocks.json
```

This CLI does not extract Firefox storage. The saved `forward` program and Firefox's
`127.0.0.1:4175` profile remain untouched. Copy the Python helper and compiled JSON with the
authorized SSH identity. Current temporary ugKid paths are `/tmp/kidx-ev3-usb.py` and
`/tmp/kidx-compiled-four-blocks.json`. Inspecting performs only reads:

```sh
python3 -B /tmp/kidx-ev3-usb.py inspect --serial 00165362f404
```

Preview without opening any device:

```sh
python3 -B /tmp/kidx-ev3-usb.py run /tmp/kidx-compiled-four-blocks.json \
  --serial 00165362f404 --left-port B --right-port C \
  --left-polarity 1 --right-polarity 1
```

These positive polarities are provisional bench settings, not a direction receipt. Swap
B/C or change either polarity to `-1` when the chassis is assembled. Add **`--execute`**
only for an explicitly started, supervised physical run; Ctrl+C requests stop. The adapter
emits JSON lines for identity, acknowledged pulses, stop and completion. Errors exit
nonzero, including an unconfirmed final stop. Do not automatically retry an uncertain run.

The helper rediscovers the serial, verifies the opened handle's vendor/product and serial,
and takes an advisory lock. Run one EV3 controller at a time and stop brick-side programs
first; the lock coordinates this helper, not unrelated LEGO software. The owner granted
`yb` access to the current `/dev/hidraw3` with a scoped ACL. Reconnects may require fresh
discovery and access. No persistent USB rule, firmware change or package install was made.

## Validation and scope

```powershell
node --test test/ev3-compile.test.mjs test/ev3-programs.test.mjs
python -B -m unittest discover -s test -p '*_test.py' -v
npx eslint tools/ev3-compile.mjs test/ev3-compile.test.mjs --max-warnings 0
```

Node tests cover runner export, invalid/overlong programs and snapshot isolation. Python
tests cover mapping, inversion, timing, wire encoding, invalid input, lost acknowledgments,
interruption, busy motors and stop failure. The fake transport tests do not qualify hardware.
Python 3 is required for that separate protocol suite; `npm test` remains Node-only.

Live inspection on ugKid passes, including opened-handle serial verification and idle B/C
motors. The compiled four-block preview passes with `executed: false`. Receipts are under
`output/ev3-usb/`. No additional motor movement was sent during implementation.

After the owner's explicit "go", the compiled Forward -> Stop sequence ran on the real
brick with provisional positive polarities: Forward = 250+250+250+150 ms at +20% on B/C,
then 450 ms neutral Stop. Every command and the final brake were acknowledged, and the
owner confirmed both motors turned and stopped. `forward-stop-run.jsonl` retains the
receipt. This is the first real shared-sequence execution; it does not qualify a chassis
route, physical turn angle, or stopping after controller/USB loss.

The owner then authorized both remaining bench tests and confirmed inversion and both stops:

- `compiled-left-right-stop.json`: B=-20/C=+20 for 550 ms, then the opposite powers for
  550 ms, then 450 ms Stop; each movement remains split into chunks <=250 ms. All commands
  and final braking were acknowledged. Receipt: `left-right-stop-run.jsonl`.
- Controller loss: `output/ev3-usb/fault_stop.py`, copied to `/tmp/kidx-fault-stop.py`, ran
  the real adapter, confirmed the first 250 ms pulse was busy, and called `os._exit(99)`.
  No final Stop was sent. `controllerExitWhileBusy` and exit 99 establish the intended fault;
  subsequent read-only inspection returned busy=false, and the owner saw the short impulse
  stop by itself. Receipts: `fault-stop-run.jsonl`, `fault-stop-exit.txt`, `fault-stop-after.json`.

The fault helper still defaults to a no-device preview; execution always requires its
explicit `--execute` flag. This tests actual controller-process loss on unmounted motors,
not physical USB unplug, whole-PC power loss or exact mechanical stopping latency.

The integration task's single full gate passed **58/58 with zero retries on `0561dcd`**.
It covers the frozen browser build on 4175. This tooling-only adapter has separate targeted
tests; no browser source, bundle, BallZ aiming or workbench steering changed here.
Owner-confirmed Programs name/copy/overflow/Escape coverage is recorded in
[ugKid acceptance](KIDX_UGKID_ACCEPTANCE.md).

## Protocol references

- [LEGO developer kits](https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/developer-kits/): direct commands and firmware bytecodes.
- [LEGO communication kit](https://www.lego.com/cdn/cs/set/assets/blt6879b00ae6951482/LEGO_MINDSTORMS_EV3_Communication_Developer_Kit.pdf), pp. 24–25: command/reply framing and constant encoding.
- [Linux hidraw documentation](https://docs.kernel.org/hid/hidraw.html) and [ioctl definitions](https://raw.githubusercontent.com/torvalds/linux/master/include/uapi/linux/hidraw.h): report prefix and opened-handle identity.

No push, merge into main, production deployment or general application abstraction.
