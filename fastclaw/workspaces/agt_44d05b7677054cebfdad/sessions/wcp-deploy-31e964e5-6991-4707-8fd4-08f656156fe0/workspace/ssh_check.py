import paramiko
import sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    ssh.connect('100.118.101.101', port=22, username='lyn', password='lyndq123', timeout=15)
except Exception as e:
    print(f"SSH_CONNECT_FAILED: {e}")
    sys.exit(1)

commands = [
    "nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader",
    "df -h / /home 2>/dev/null",
    "ls -la ~/LHL/ 2>/dev/null || echo 'LHL_DIR_NOT_EXISTS'",
    "which python3 && python3 --version",
    "which uv 2>/dev/null || echo 'UV_NOT_FOUND'",
]

for cmd in commands:
    print(f"\n=== CMD: {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")

ssh.close()
print("\n=== SSH DONE ===")
