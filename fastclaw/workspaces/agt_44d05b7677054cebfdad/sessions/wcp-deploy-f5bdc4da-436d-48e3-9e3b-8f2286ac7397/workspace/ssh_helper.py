import paramiko
import sys

def ssh_exec(host, port, username, password, command, timeout=60):
    """Execute a command on remote host via SSH and print output."""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=port, username=username, password=password, timeout=15)
        stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        out = stdout.read().decode()
        err = stderr.read().decode()
        exit_code = stdout.channel.recv_exit_status()
        if out:
            print(out)
        if err:
            print(f"[STDERR] {err}", file=sys.stderr)
        return exit_code, out, err
    finally:
        ssh.close()

if __name__ == "__main__":
    host = "100.118.101.101"
    port = 22
    username = "lyn"
    password = "lyndq123"
    command = sys.argv[1] if len(sys.argv) > 1 else "echo hello"
    exit_code, _, _ = ssh_exec(host, port, username, password, command)
    sys.exit(exit_code)
