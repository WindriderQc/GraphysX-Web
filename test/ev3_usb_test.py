"""Offline protocol/failure tests: python -B -m unittest discover -s test -p '*_test.py'."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ev3_usb", Path(__file__).parents[1] / "tools/ev3_usb.py")
usb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usb)


def sequence():
    return {"schema": usb.SCHEMA, "steps": [
        {"durationMs": 900, "input": {"thrust": 1, "turn": 0}},
        {"durationMs": 550, "input": {"thrust": 0, "turn": -1}},
        {"durationMs": 550, "input": {"thrust": 0, "turn": 1}},
        {"durationMs": 450, "input": {"thrust": 0, "turn": 0}},
    ]}


class FakeBrick:
    def __init__(self, fail_motion=False, fail_stop=False, busy=False, motor_type=7):
        self.commands = []
        self.fail_motion, self.fail_stop = fail_motion, fail_stop
        self.initial_busy, self.motor_type = busy, motor_type
        self.stuck = False

    def inspect(self):
        return {"ports": {"B": {"type": self.motor_type}, "C": {"type": 7}}, "busy": self.initial_busy}

    def exchange(self, code, globals_size=0):
        self.commands.append(code)
        if code[0] == 0xAD and self.fail_motion:
            raise TimeoutError("Lost acknowledgment")
        if code == usb.stop_code(6) and self.fail_stop:
            raise OSError("Disconnected")
        return b""

    def busy(self, mask):
        return self.stuck


class UsbTests(unittest.TestCase):
    def plan(self, value=None, **overrides):
        options = dict(left_port="B", right_port="C", left_polarity=1, right_polarity=1, power=20)
        options.update(overrides)
        return usb.plan_sequence(value if value is not None else sequence(), **options)

    def test_differential_mapping_and_per_motor_inversion(self):
        chunks = self.plan()
        self.assertEqual([next(c["motors"] for c in chunks if c["step"] == i) for i in range(4)],
                         [{"B": 20, "C": 20}, {"B": -20, "C": 20},
                          {"B": 20, "C": -20}, {"B": 0, "C": 0}])
        self.assertEqual(self.plan(left_port="C", right_port="B", left_polarity=-1)[0]["motors"],
                         {"C": -20, "B": 20})

    def test_cli_preview_and_invalid_execution_never_open_usb(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sequence.json"
            path.write_text(json.dumps(sequence()), encoding="utf-8")
            args = ["ev3_usb.py", "run", str(path), "--serial", "offline-test",
                    "--left-port", "B", "--right-port", "C", "--left-polarity", "1", "--right-polarity", "1"]
            with patch.object(usb, "Ev3Usb", side_effect=AssertionError("USB must not open")), patch.object(sys, "argv", args):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    usb.main()
                self.assertFalse(json.loads(output.getvalue())["executed"])
                data = sequence()
                data["steps"][-1]["durationMs"] = 0
                path.write_text(json.dumps(data), encoding="utf-8")
                with patch.object(sys, "argv", args + ["--execute"]), self.assertRaises(ValueError):
                    usb.main()

    def test_chunks_preserve_each_duration_and_bound_every_motion(self):
        chunks = self.plan()
        self.assertTrue(all(0 < c["durationMs"] <= 250 for c in chunks))
        for i, step in enumerate(sequence()["steps"]):
            self.assertEqual(sum(c["durationMs"] for c in chunks if c["step"] == i), step["durationMs"])
        self.assertEqual([c["durationMs"] for c in chunks if c["step"] == 0], [250, 250, 250, 150])

    def test_rejects_bad_plan_before_usb_is_needed(self):
        for overrides in ({"power": 21}, {"power": 0}, {"power": True}, {"left_port": "A"},
                          {"left_port": "C"}, {"left_polarity": 0}, {"right_polarity": True}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.plan(**overrides)
        invalid = [None, {}, {"schema": "future", "steps": []}]
        for duration in (0, -1, 1001, True, 1.5, float("inf")):
            data = sequence()
            data["steps"][-1]["durationMs"] = duration
            invalid.append(data)
        for steer in ({"thrust": True, "turn": 0}, {"thrust": 1, "turn": 1},
                      {"thrust": 1, "turn": 0, "heading": 0}, {"thrust": 0, "turn": float("nan")}):
            data = sequence()
            data["steps"][-1]["input"] = steer
            invalid.append(data)
        data = sequence()
        data["steps"] *= 2
        invalid.append(data)
        for data in invalid:
            with self.subTest(data=data), self.assertRaises(ValueError):
                usb.validate_sequence(data)

    def test_documented_wire_encoding_and_reply_errors(self):
        chunk = {"durationMs": 250, "motors": {"B": 20}}
        self.assertEqual(usb.direct_request(usb.pulse_code(chunk), 250).hex(),
                         "000f00fa00000000ad0002140082fa000001")
        chunk["motors"]["B"] = -20
        self.assertEqual(usb.pulse_code(chunk).hex(), "ad00022c0082fa000001")
        self.assertEqual(usb.parse_reply(bytes.fromhex("0300fa0002"), 250, 0), b"")
        for report in (b"", bytes.fromhex("0300fa0004"), bytes.fromhex("0300fb0002"),
                       bytes.fromhex("0400fa0002")):
            with self.assertRaises(ValueError):
                usb.parse_reply(report, 250, 0)
        for duration in (0, 251):
            with self.assertRaises(ValueError):
                usb.pulse_code({"durationMs": duration, "motors": {"B": 20}})

    def test_normal_run_waits_each_chunk_and_finishes_with_acknowledged_stop(self):
        brick, events, waits = FakeBrick(), [], []
        chunks = self.plan()
        usb.execute_plan(brick, chunks, events.append, sleep=waits.append)
        self.assertEqual(waits, [c["durationMs"] / 1000 for c in chunks])
        self.assertEqual(brick.commands[-1], usb.stop_code(6))
        self.assertEqual(events[-1], {"event": "sequenceComplete", "physicalRouteQualified": False})

    def test_lost_motion_ack_does_not_retry_or_start_next_chunk(self):
        brick, events = FakeBrick(fail_motion=True), []
        with self.assertRaises(TimeoutError):
            usb.execute_plan(brick, self.plan(), events.append, sleep=lambda _: None)
        self.assertEqual([c[0] for c in brick.commands], [0xA7, 0xAD, 0xA3])
        self.assertNotIn("sequenceComplete", [e["event"] for e in events])

    def test_disconnect_during_final_stop_cannot_report_completion(self):
        brick, events = FakeBrick(fail_stop=True), []
        with self.assertRaises(OSError):
            usb.execute_plan(brick, self.plan(), events.append, sleep=lambda _: None)
        self.assertEqual(events[-1]["event"], "stopUnconfirmed")
        self.assertNotIn("sequenceComplete", [e["event"] for e in events])

    def test_keyboard_interrupt_attempts_stop_without_replaying(self):
        brick, events = FakeBrick(), []
        def interrupted(_duration):
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            usb.execute_plan(brick, self.plan(), events.append, sleep=interrupted)
        self.assertEqual([c[0] for c in brick.commands], [0xA7, 0xAD, 0xA3])

    def test_busy_or_missing_motor_is_left_untouched(self):
        for brick in (FakeBrick(busy=True), FakeBrick(motor_type=126)):
            with self.assertRaises(RuntimeError):
                usb.execute_plan(brick, self.plan(), lambda _: None)
            self.assertEqual(brick.commands, [])

    def test_busy_timeout_stops_before_the_next_chunk(self):
        brick, elapsed = FakeBrick(), [0]
        brick.stuck = True
        def advance(duration):
            elapsed[0] += duration
        with self.assertRaises(TimeoutError):
            usb.execute_plan(brick, self.plan(), lambda _: None, sleep=advance, now=lambda: elapsed[0])
        self.assertEqual([c[0] for c in brick.commands], [0xA7, 0xAD, 0xA3])


if __name__ == "__main__":
    unittest.main()
