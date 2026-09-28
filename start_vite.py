#!/usr/bin/env python3
"""Start Vite dev server on port 3000."""
import subprocess
import time
import urllib.request
import sys
import os
import signal
import platform

PORT = 3000
PROJECT = r"D:\Hermes Agent\ICON Email Browser Lab"

# Kill any existing process on port
if platform.system() == "Windows":
    result = subprocess.run(
        ["netstat", "-ano"], capture_output=True, text=True
    )
    for line in result.stdout.splitlines():
        if f":{PORT}" in line and "LISTENING" in line:
            parts = line.strip().split()
            pid = parts[-1]
            try:
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
            except Exception:
                pass
else:
    subprocess.run(["fuser", "-k", f"{PORT}/tcp"], capture_output=True)

time.sleep(2)

proc = subprocess.Popen(
    [sys.executable, "-m", "vite", "--config", "apps/web/vite.config.ts", "--port", str(PORT), "--strictPort"],
    cwd=PROJECT,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

PID_FILE = os.path.join(PROJECT, ".vite_pid.txt")
with open(PID_FILE, "w") as f:
    f.write(str(proc.pid))

print(f"Started Vite with PID {proc.pid}")

# Wait for ready
deadline = time.time() + 60
ready = False
while time.time() < deadline:
    try:
        resp = urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=2)
        if resp.status == 200:
            print(f"VITE READY on port {PORT}")
            ready = True
            break
    except Exception:
        pass
    time.sleep(1)

if not ready:
    print("FAILED to start Vite")
    proc.terminate()
    sys.exit(1)

# Keep process alive
try:
    proc.wait()
except KeyboardInterrupt:
    proc.terminate()