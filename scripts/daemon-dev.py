#!/usr/bin/env python3
"""Double-fork daemonizer: start `bun run dev` detached so it survives the
spawning shell (the tool-session reaper kills plain background children).

Usage: python3 /home/z/my-project/scripts/daemon-dev.py
"""
import os
import subprocess
import sys

PROJECT = "/home/z/my-project"

# fork #1 — parent exits immediately
if os.fork() > 0:
    sys.exit(0)

os.setsid()

# fork #2 — session leader exits; grandchild is reparented to PID 1
if os.fork() > 0:
    sys.exit(0)

# redirect stdio away from the dead tty
devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
os.dup2(devnull, 1)
os.dup2(devnull, 2)

# start the dev server (script itself pipes through tee into dev.log)
subprocess.Popen(
    ["bun", "run", "dev"],
    cwd=PROJECT,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    stdin=subprocess.DEVNULL,
    start_new_session=True,
    close_fds=True,
)
