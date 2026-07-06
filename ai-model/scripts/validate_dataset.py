#!/usr/bin/env python3
"""Sanity-check the built instruction dataset. Pure standard library."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(os.path.dirname(HERE), "data", "bharatchain-instruct.jsonl")


def main():
    if not os.path.exists(PATH):
        raise SystemExit(f"Not found: {PATH}\nRun build_dataset.py first.")
    n = 0
    roles_ok = 0
    empty = 0
    with open(PATH, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            n += 1
            obj = json.loads(line)  # raises on bad JSON
            msgs = obj.get("messages", [])
            roles = [m["role"] for m in msgs]
            assert roles == ["system", "user", "assistant"], f"line {i}: bad roles {roles}"
            roles_ok += 1
            for m in msgs:
                if not m.get("content", "").strip():
                    empty += 1
    print(f"OK: {n} examples, {roles_ok} with correct system/user/assistant order, {empty} empty contents.")
    with open(PATH, encoding="utf-8") as f:
        sample = json.loads(f.readline())
    print("\nSample user turn:\n", sample["messages"][1]["content"][:300], "...")
    print("\nSample assistant turn:\n", sample["messages"][2]["content"][:300])


if __name__ == "__main__":
    main()
