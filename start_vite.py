#!/usr/bin/env python3
"""Start Vite dev server and keep it alive."""
import subprocess
import sys
import time
import urllib.request
import os
import platform

PORT = 3000
PROJECT = r"D:\Hermes Agent\ICON Email Browser Lab"

def kill_port(port):
    """Kill processes using the given port."""
    if platform.system() == "Windows":
        result = subprocess.run(["netstat", "-ano"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                try:
                    subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
                except Exception:
                    pass
    else:
        subprocess.run(["fuser", "-k", f"{port}/tcp"], capture_output=True)

kill_port(PORT)
time.sleep(2)

# Clear Vite cache
vite_cache = os.path.join(PROJECT, "node_modules", ".vite")
if os.path.exists(vite_cache):
    import shutil
    shutil.rmtree(vite_cache)

print(f"Starting Vite on port {PORT}...")
proc = subprocess.Popen(
    [sys.executable, "-m", "vite", "--config", "vite.config.ts", "--port", str(PORT), "--strictPort"],
    cwd=PROJECT,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

with open(os.path.join(PROJECT, ".vite_pid.txt"), "w") as f:
    f.write(str(proc.pid))

print(f"Vite PID: {proc.pid}")

# Wait for ready
deadline = time.time() + 60
ready = False
while time.time() < deadline:
    try:
        resp = urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=2)
        if resp.status == 200:
            print(f"✓ Vite READY on port {PORT}")
            ready = True
            break
    except Exception:
        pass
    time.sleep(1)

if not ready:
    print("✗ FAILED to start Vite")
    proc.terminate()
    sys.exit(1)

# Keep process alive
try:
    proc.wait()
except KeyboardInterrupt:
    print("\nShutting down...")
    proc.terminate()
