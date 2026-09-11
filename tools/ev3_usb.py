#!/usr/bin/env python3
"""Linux USB adapter for KidX compiled steering inputs. Preview is the default.

Python standard library only. Every moving command expires on the EV3 within
250 ms; no OUTPUT_START, unbounded motion, or queued whole-program bytecode.
See docs/KIDX_EV3_USB.md for protocol sources and qualification limits.
"""
import argparse
import json
import os
from pathlib import Path
import select
import signal
import struct
import sys
import time

SCHEMA = "kidx.ev3-input-sequence/v1"
MAX_PULSE_MS = 250
MAX_POWER = 20
PORTS = {"B": 1, "C": 2}


def validate_sequence(value):
    if not isinstance(value, dict) or set(value) != {"schema", "steps"} or value["schema"] != SCHEMA:
        raise ValueError("Unsupported compiled sequence")
    steps = value["steps"]
    if not isinstance(steps, list) or not 1 <= len(steps) <= 6:
        raise ValueError("Expected one to six compiled inputs")
    for step in steps:
        if not isinstance(step, dict) or set(step) != {"durationMs", "input"}:
            raise ValueError("Invalid compiled step")
        if type(step["durationMs"]) is not int or not 1 <= step["durationMs"] <= 1000:
            raise ValueError("Step duration must be 1..1000 whole milliseconds")
        steer = step["input"]
        if not isinstance(steer, dict) or set(steer) != {"thrust", "turn"}:
            raise ValueError("Unsupported steering fields")
        if any(type(v) is not int for v in steer.values()):
            raise ValueError("Expected integer steering inputs")
        if (steer["thrust"], steer["turn"]) not in {(0, 0), (1, 0), (0, -1), (0, 1)}:
            raise ValueError("Unsupported First Drive steering input")
    return steps


def plan_sequence(sequence, left_port, right_port, left_polarity, right_polarity, power):
    steps = validate_sequence(sequence)
    if left_port not in PORTS or right_port not in PORTS or left_port == right_port:
        raise ValueError("Select distinct B/C motor ports")
    if any(type(p) is not int or p not in (-1, 1) for p in (left_polarity, right_polarity)):
        raise ValueError("Both polarities must explicitly be -1 or 1")
    if type(power) is not int or not 1 <= power <= MAX_POWER:
        raise ValueError("Power must be 1..20 percent")
    chunks = []
    for index, step in enumerate(steps):
        thrust, turn = step["input"]["thrust"], step["input"]["turn"]
        # Positive turn is clockwise: left wheel forward, right wheel backward.
        motors = {left_port: (thrust + turn) * power * left_polarity,
                  right_port: (thrust - turn) * power * right_polarity}
        remaining = step["durationMs"]
        while remaining:
            duration = min(remaining, MAX_PULSE_MS)
            chunks.append({"step": index, "durationMs": duration, "motors": motors.copy()})
            remaining -= duration
    return chunks


def constant(value):
    if -32 <= value <= 31:
        return bytes([value & 0x3f])
    return b"\x82" + struct.pack("<h", value)


def direct_request(code, counter, globals_size=0):
    body = struct.pack("<HBH", counter, 0, globals_size) + code
    # The EV3 report is unnumbered; Linux hidraw still requires a leading zero.
    return b"\0" + struct.pack("<H", len(body)) + body


def parse_reply(report, counter, globals_size):
    if len(report) < 5:
        raise ValueError("Truncated EV3 reply")
    size, reply_counter, kind = struct.unpack_from("<HHB", report)
    if (size, reply_counter, kind) != (3 + globals_size, counter, 2) or len(report) < size + 2:
        raise ValueError("EV3 rejected command or returned a mismatched reply")
    return report[5:size + 2]


def stop_code(mask):
    return bytes([0xA3, 0, mask, 1])  # OUTPUT_STOP with braking


def pulse_code(chunk):
    duration = chunk["durationMs"]
    if type(duration) is not int or not 1 <= duration <= MAX_PULSE_MS:
        raise ValueError("Pulse exceeds the brick-side time bound")
    code = b""
    for port, power in chunk["motors"].items():
        if port not in PORTS or type(power) is not int or abs(power) > MAX_POWER:
            raise ValueError("Unsupported motor command")
        mask = 1 << PORTS[port]
        if power == 0:
            code += stop_code(mask)
        else:
            # OUTPUT_TIME_POWER: layer, mask, power, ramp 0, hold, ramp 0, brake.
            code += bytes([0xAD, 0, mask]) + constant(power) + b"\0" + constant(duration) + b"\0\1"
    return code


class Ev3Usb:
    def __init__(self, serial):
        if not sys.platform.startswith("linux"):
            raise RuntimeError("USB execution requires Linux; previews work without a device")
        import fcntl
        matches = []
        for node in Path("/sys/class/hidraw").glob("hidraw*"):
            try:
                info = dict(line.split("=", 1) for line in (node / "device/uevent").read_text().splitlines() if "=" in line)
            except FileNotFoundError:
                continue
            if info.get("HID_ID") == "0003:00000694:00000005" and info.get("HID_UNIQ") == serial:
                matches.append(Path("/dev") / node.name)
        if len(matches) != 1:
            raise RuntimeError(f"Expected one USB EV3 with serial {serial}; found {len(matches)}")
        self.fd = os.open(matches[0], os.O_RDWR | os.O_NONBLOCK)
        self.counter = 0
        try:
            raw = bytearray(8)
            fcntl.ioctl(self.fd, 0x80084803, raw, True)  # HIDIOCGRAWINFO
            if struct.unpack("<IHH", raw) != (3, 0x0694, 0x0005):
                raise RuntimeError("Opened handle is not a USB EV3")
            # Verify the serial on the opened handle too, closing the discovery/open race.
            unique = bytearray(256)
            fcntl.ioctl(self.fd, 0x80000008 | (len(unique) << 16) | (ord("H") << 8), unique, True)
            if unique.split(b"\0", 1)[0].decode("ascii") != serial:
                raise RuntimeError("Opened EV3 serial changed during discovery")
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            self.close()
            raise

    def close(self):
        os.close(self.fd)

    def exchange(self, code, globals_size=0):
        self.counter = (self.counter + 1) % 65536
        request = direct_request(code, self.counter, globals_size)
        if os.write(self.fd, request) != len(request):
            raise OSError("Short EV3 write; command may have been accepted, do not retry")
        if not select.select([self.fd], [], [], 1)[0]:
            raise TimeoutError("EV3 acknowledgment missing; command may have executed, do not retry")
        return parse_reply(os.read(self.fd, 1024), self.counter, globals_size)

    def busy(self, mask):
        return bool(self.exchange(bytes([0xA9, 0, mask, 0x60]), 1)[0])

    def inspect(self):
        versions = {}
        for field, selector in (("firmware", 10), ("hardware", 9)):
            versions[field] = self.exchange(bytes([0x81, selector, 16, 0x60]), 16).split(b"\0", 1)[0].decode("ascii")
        ports = {}
        for port, number in PORTS.items():
            reply = self.exchange(bytes([0x99, 5, 0, 16 + number, 0x60, 0x61]), 2)
            ports[port] = {"type": reply[0], "mode": reply[1]}
        return {"versions": versions, "ports": ports, "busy": self.busy(6)}


def execute_plan(device, chunks, emit, sleep=time.sleep, now=time.monotonic):
    """Serial, acknowledged pulses; transport failures never replay a movement."""
    identity = device.inspect()
    if any(port["type"] != 7 for port in identity["ports"].values()):
        raise RuntimeError("Expected large motors on B and C")
    if identity["busy"]:
        raise RuntimeError("Motors already busy; leave the other program untouched")
    emit({"event": "ready", **identity})
    completed = False
    try:
        # Make our software polarity independent of a previous brick program.
        device.exchange(bytes([0xA7, 0, 6, 1]))  # OUTPUT_POLARITY, B/C, positive
        for chunk in chunks:
            code = pulse_code(chunk)
            device.exchange(code)
            emit({"event": "pulseAcknowledged", **chunk})
            # Never replace a pulse before its commanded time and idle observation.
            sleep(chunk["durationMs"] / 1000)
            deadline = now() + 0.5
            while device.busy(6):
                if now() >= deadline:
                    raise TimeoutError("Motor remained busy after its bounded pulse")
                sleep(0.02)
        completed = True
    finally:
        try:
            device.exchange(stop_code(6))
            emit({"event": "stopAcknowledged"})
        except (OSError, ValueError, RuntimeError, TimeoutError) as error:
            emit({"event": "stopUnconfirmed", "error": str(error), "brickPulseLimitMs": MAX_PULSE_MS})
            if completed:
                raise
    emit({"event": "sequenceComplete", "physicalRouteQualified": False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="Read identity, motor types and busy state only")
    inspect.add_argument("--serial", required=True)
    run = commands.add_parser("run", help="Preview a compiled sequence; --execute sends it")
    run.add_argument("sequence", type=Path)
    run.add_argument("--serial", required=True)
    run.add_argument("--left-port", choices=PORTS, required=True)
    run.add_argument("--right-port", choices=PORTS, required=True)
    run.add_argument("--left-polarity", type=int, choices=(-1, 1), required=True)
    run.add_argument("--right-polarity", type=int, choices=(-1, 1), required=True)
    run.add_argument("--power", type=int, default=20)
    run.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    emit = lambda value: print(json.dumps(value), flush=True)
    if args.command == "run":
        if args.sequence.stat().st_size > 8192:
            raise ValueError("Compiled sequence is too large")
        chunks = plan_sequence(json.loads(args.sequence.read_text(encoding="utf-8-sig")),
                               args.left_port, args.right_port, args.left_polarity, args.right_polarity, args.power)
        if not args.execute:
            emit({"executed": False, "serial": args.serial, "chunks": chunks,
                  "brickPulseLimitMs": MAX_PULSE_MS, "physicalRouteQualified": False})
            return
    device = Ev3Usb(args.serial)
    try:
        if args.command == "inspect":
            emit({"serial": args.serial, **device.inspect(), "motorCommandsSent": 0})
        else:
            def interrupted(_number, _frame):
                raise KeyboardInterrupt("Execution interrupted")
            for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(number, interrupted)
            execute_plan(device, chunks, emit)
    finally:
        device.close()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, TimeoutError, KeyboardInterrupt) as error:
        print(json.dumps({"event": "failed", "error": str(error), "physicalRouteQualified": False}), flush=True)
        sys.exit(1)
