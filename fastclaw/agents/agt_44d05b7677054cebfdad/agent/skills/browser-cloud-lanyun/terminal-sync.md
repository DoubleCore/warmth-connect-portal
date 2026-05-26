# 终端侧 Inventory 与扫描脚本

本文件是 skill 和本机文件系统之间的契约。所有操作都是**纯 shell**——不写数据库、不调 HTTP、不写多维表格。

## 一、初次部署（只做一次）

```bash
# 1) 目录已存在的话这句幂等
mkdir -p ~/.openclaw/workspace/knowledge

# 2) 如果 inventory 不存在，写一个空骨架
if [ ! -f ~/.openclaw/workspace/knowledge/lanyun-inventory.json ]; then
  cat > ~/.openclaw/workspace/knowledge/lanyun-inventory.json <<'JSON'
{
  "schema_version": 1,
  "updated_at": null,
  "instances": []
}
JSON
fi

# 3) 写扫描脚本（内容见下方 §三，整段粘进去）
$EDITOR ~/.openclaw/workspace/knowledge/scan-lanyun.sh
chmod +x ~/.openclaw/workspace/knowledge/scan-lanyun.sh

# 4) 装前置依赖
#    · sshpass：密码方式登录 SSH（蓝耘 root 容器没有公钥通道）
#    · jq：解析和更新 inventory JSON
#      Linux:  sudo apt install sshpass jq
#      macOS:  brew install hudochenkov/sshpass/sshpass jq
#      WSL:    同 Linux
which sshpass jq
```

> Windows 本机跑不了这一套（没有 sshpass，也没有同等 Unix 工具链）。
> 推荐 Windows 用户在 **WSL** 里完整跑 skill 的本机侧；浏览器本体仍可在 Windows。

## 二、inventory JSON 结构

完整的单条实例字段：

```jsonc
{
  "id": "lanyun-rtx3090-01",           // 本地唯一 id；用户易读名，后续查询/删除按此识别
  "provider": "lanyun",                // 便于未来扩展其他云；当前固定
  "remote_instance_id": "xxxxxxxx",    // 控制台展示的实例 ID，跨 restart 追溯用
  "region": "inner-mongolia-1",
  "gpu_model": "RTX3090",
  "gpu_count": 1,
  "image_name": "pytorch-2.1.2-py3.10-cuda12.1",
  "billing_mode": "pay_as_you_go",     // pay_as_you_go / package_day / package_week / ...
  "hourly_cost": "1.50",               // 字符串保留小数位
  "ssh_host": "link.lanyun.net",
  "ssh_port": 35123,
  "ssh_username": "root",
  "ssh_password": "<clipboard 拦截到的明文>",
  "purchased_at": "2026-05-10T14:30:00+08:00",
  "released_at": null,                 // 释放后填 ISO 时间，scan 会跳过
  "notes": "用于复现 CSLR SOTA",
  "state": {                           // 由 scan 脚本写回，首次添加时填 null
    "last_seen_at": null,
    "last_sync_ok": null,
    "last_sync_error": null,
    "status": null,                    // "running" / "idle" / "offline"
    "uptime_seconds": null,
    "cpu_idle_pct": null,
    "mem_used_mb": null,
    "mem_total_mb": null,
    "disk_used_gb": null,
    "disk_total_gb": null,
    "disk_used_pct": null,
    "gpu_utilization": null,           // "0/87"（每张卡 util% 用 / 拼接）
    "gpu_memory_used_mb": null,
    "gpu_memory_total_mb": null,
    "gpus": null                       // 每张卡的原始明细数组
  }
}
```

最小必填字段：`id` + `ssh_host` + `ssh_port` + `ssh_username` + `ssh_password`。其他都可留空或缺省。

## 三、向 inventory 追加一条机箱（一键命令）

不要手改 JSON（容易漏逗号），用 `jq` 合入：

```bash
INV=~/.openclaw/workspace/knowledge/lanyun-inventory.json

# 把要加的条目写进一个临时变量
NEW_INSTANCE=$(cat <<'JSON'
{
  "id": "lanyun-rtx3090-01",
  "provider": "lanyun",
  "remote_instance_id": "xxxxxxxx",
  "region": "inner-mongolia-1",
  "gpu_model": "RTX3090",
  "gpu_count": 1,
  "image_name": "pytorch-2.1.2-py3.10-cuda12.1",
  "billing_mode": "pay_as_you_go",
  "hourly_cost": "1.50",
  "ssh_host": "link.lanyun.net",
  "ssh_port": 35123,
  "ssh_username": "root",
  "ssh_password": "<clipboard 拦截到的明文>",
  "purchased_at": "2026-05-10T14:30:00+08:00",
  "released_at": null,
  "notes": "",
  "state": {
    "last_seen_at": null, "last_sync_ok": null, "last_sync_error": null, "status": null,
    "uptime_seconds": null, "cpu_idle_pct": null,
    "mem_used_mb": null, "mem_total_mb": null,
    "disk_used_gb": null, "disk_total_gb": null, "disk_used_pct": null,
    "gpu_utilization": null, "gpu_memory_used_mb": null, "gpu_memory_total_mb": null,
    "gpus": null
  }
}
JSON
)

# upsert：同 id 就替换，不存在就追加；同时刷 updated_at
jq --argjson item "$NEW_INSTANCE" \
   --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.updated_at=$now
    | .instances = (
        (.instances | map(select(.id != $item.id)))
        + [$item]
      )' \
   "$INV" > "$INV.tmp" && mv "$INV.tmp" "$INV"
```

## 四、`scan-lanyun.sh`（整段粘贴即可）

目的：读 inventory → 对每台 **未释放、凭据齐全** 的机器跑一条合并 SSH 命令采集指标 → 把 `state` 字段写回原文件。失败的机器也要写回一个 `{last_sync_ok:false, status:"offline"}`，以便后续查询。

```bash
#!/usr/bin/env bash
# scan-lanyun.sh — 每分钟 SSH 扫描 lanyun-inventory.json 里的所有机箱。
# 放在 ~/.openclaw/workspace/knowledge/scan-lanyun.sh 并 chmod +x。
#
# 关键设计：
#   · 每台机器只发一条**合并** SSH（蓝耘 link 节点 >10/分钟 会限流）
#   · 单机超时 15s；扫描之间不串行阻塞太久，用最多 3 并发
#   · 采集命令输出分段标记：UPTIME / CPU / MEM / DISK / GPUS_START…GPUS_END
#   · 写回用 jq 的 atomic 风格：先写 .tmp 再 mv 覆盖
#   · 已释放（.released_at 非 null）或 SSH 凭据不全的条目直接跳过
#
# 依赖：bash / sshpass / jq / awk / date
set -u

INV="${LANYUN_INVENTORY:-$HOME/.openclaw/workspace/knowledge/lanyun-inventory.json}"
SSH_TIMEOUT_SEC="${LANYUN_SSH_TIMEOUT_SEC:-15}"
MAX_PARALLEL="${LANYUN_MAX_PARALLEL:-3}"

if [ ! -f "$INV" ]; then
  echo "inventory not found: $INV" >&2
  exit 1
fi

# 远程合并命令，严格按行输出；每段都带兜底不让任何单步 fail 撑断后续行。
remote_script() {
  cat <<'SH'
awk '{print "UPTIME " int($1)}' /proc/uptime 2>/dev/null || echo "UPTIME 0"
(top -bn1 2>/dev/null | awk '/Cpu\(s\)/{print "CPU " $8; exit}') || echo "CPU 0"
(free -m 2>/dev/null | awk '/^Mem:/{print "MEM " $3 " " $2}') || echo "MEM 0 0"
(df -BG / 2>/dev/null | awk 'NR==2{gsub("G","",$3); gsub("G","",$2); gsub("%","",$5); print "DISK " $3 " " $2 " " $5}') || echo "DISK 0 0 0"
echo GPUS_START
nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || true
echo GPUS_END
SH
}
REMOTE_CMD=$(remote_script | tr '\n' ';' | sed 's/;;/;/g')

# 把一台机器的扫描结果输出成一行 JSON（包含 id 和新的 state 对象）。
scan_one() {
  local id="$1" host="$2" port="$3" user="$4" pw="$5"
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # 调 sshpass + ssh，StrictHostKeyChecking=no 避免 known_hosts 抖动；
  # 2>&1 捕获 stderr；超时让整个 ssh 进程被 SIGTERM。
  local out err
  out=$(timeout "${SSH_TIMEOUT_SEC}s" sshpass -p "$pw" ssh \
        -p "$port" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout="${SSH_TIMEOUT_SEC}" \
        -o BatchMode=no \
        "${user}@${host}" \
        "bash -s" <<<"$REMOTE_CMD" 2>&1)
  local rc=$?

  if [ $rc -ne 0 ]; then
    # 失败路径：last_sync_error 截断前 2000 字节
    err=$(printf '%s' "$out" | head -c 2000)
    jq -cn --arg id "$id" --arg now "$now" --arg err "$err" '
      { id: $id, state: {
          last_seen_at: $now, last_sync_ok: false, last_sync_error: $err,
          status: "offline",
          uptime_seconds: null, cpu_idle_pct: null,
          mem_used_mb: null, mem_total_mb: null,
          disk_used_gb: null, disk_total_gb: null, disk_used_pct: null,
          gpu_utilization: null, gpu_memory_used_mb: null, gpu_memory_total_mb: null,
          gpus: null
      } }'
    return
  fi

  # 解析输出段；每段失败了就用 null 兜底。awk 单行脚本扫整段输出。
  local uptime cpu_idle mem_used mem_total disk_used disk_total disk_pct
  uptime=$(echo "$out"     | awk '$1=="UPTIME"{print $2; exit}')
  cpu_idle=$(echo "$out"   | awk '$1=="CPU"{print $2; exit}')
  read -r mem_used mem_total <<<"$(echo "$out" | awk '$1=="MEM"{print $2" "$3; exit}')"
  read -r disk_used disk_total disk_pct <<<"$(echo "$out" | awk '$1=="DISK"{print $2" "$3" "$4; exit}')"

  # GPU 段按 GPUS_START/GPUS_END 之间的 CSV 行解析
  local gpus_csv
  gpus_csv=$(echo "$out" | awk '/^GPUS_START$/{flag=1; next} /^GPUS_END$/{flag=0} flag' | tr -d '\r')

  # 用 jq 组装 gpus 数组 + 汇总字段
  local gpu_json
  if [ -n "$gpus_csv" ]; then
    gpu_json=$(printf '%s\n' "$gpus_csv" | jq -Rn '
      [ inputs
        | split(",") | map(gsub("^ +| +$"; ""))
        | select(length >= 5)
        | {
            index: (.[0] | tonumber? // 0),
            name: .[1],
            utilization_pct: (.[2] | tonumber? // 0),
            memory_used_mb: (.[3] | tonumber? // 0),
            memory_total_mb: (.[4] | tonumber? // 0),
            temperature_c: (.[5] // "" | tonumber? // null)
          }
      ]')
  else
    gpu_json="[]"
  fi

  # 汇总 gpu_utilization 字符串（"0/87"）+ 总显存
  local util_joined mem_used_total mem_total_total gpu_count
  util_joined=$(echo "$gpu_json" | jq -r 'map(.utilization_pct|round|tostring) | join("/") // ""')
  mem_used_total=$(echo "$gpu_json" | jq 'map(.memory_used_mb) | add // 0')
  mem_total_total=$(echo "$gpu_json" | jq 'map(.memory_total_mb) | add // 0')
  gpu_count=$(echo "$gpu_json" | jq 'length')

  # 推断 status：任意 GPU util > 5 视为 running，否则 idle；没 GPU 就不动，保守给 running
  local status
  if [ "$gpu_count" -eq 0 ]; then
    status="running"
  else
    local active
    active=$(echo "$gpu_json" | jq '[.[] | select(.utilization_pct > 5)] | length')
    if [ "$active" -gt 0 ]; then status="running"; else status="idle"; fi
  fi

  jq -cn \
    --arg id "$id" --arg now "$now" --arg status "$status" \
    --arg util "$util_joined" \
    --argjson gpus "$gpu_json" \
    --argjson uptime "${uptime:-null}" \
    --argjson cpu_idle "${cpu_idle:-null}" \
    --argjson mem_used "${mem_used:-null}" --argjson mem_total "${mem_total:-null}" \
    --argjson disk_used "${disk_used:-null}" --argjson disk_total "${disk_total:-null}" \
    --argjson disk_pct "${disk_pct:-null}" \
    --argjson gpu_mem_used "$mem_used_total" --argjson gpu_mem_total "$mem_total_total" '
    { id: $id, state: {
        last_seen_at: $now, last_sync_ok: true, last_sync_error: null,
        status: $status,
        uptime_seconds: $uptime, cpu_idle_pct: $cpu_idle,
        mem_used_mb: $mem_used, mem_total_mb: $mem_total,
        disk_used_gb: $disk_used, disk_total_gb: $disk_total, disk_used_pct: $disk_pct,
        gpu_utilization: (if $util == "" then null else $util end),
        gpu_memory_used_mb: $gpu_mem_used,
        gpu_memory_total_mb: $gpu_mem_total,
        gpus: $gpus
    } }'
}

# ---- 主逻辑 ----
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# 挑出所有"需要扫"的条目：released_at 为 null 且 SSH 四件套齐全
mapfile -t TARGETS < <(jq -r '
  .instances[]
  | select(.released_at == null)
  | select(.ssh_host and .ssh_port and .ssh_username and .ssh_password)
  | [.id, .ssh_host, (.ssh_port|tostring), .ssh_username, .ssh_password]
  | @tsv' "$INV")

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "no targets" >&2
  exit 0
fi

# 并发池：用 xargs -P 控制；把每台机器的结果写到 $TMPDIR/<id>.json
export -f scan_one remote_script
export REMOTE_CMD SSH_TIMEOUT_SEC

printf '%s\n' "${TARGETS[@]}" | \
  xargs -I{} -P "$MAX_PARALLEL" bash -c '
    IFS=$'"'"'\t'"'"' read -r id host port user pw <<< "$1"
    out=$(scan_one "$id" "$host" "$port" "$user" "$pw")
    printf "%s\n" "$out" > "'"$TMPDIR"'/$id.json"
  ' _ {}

# 汇总所有结果成一个 id → state 的 map
MERGED=$(cat "$TMPDIR"/*.json | jq -s 'map({(.id): .state}) | add')

# 把 merged 合并回原 inventory 的 instances 数组
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --argjson merged "$MERGED" --arg now "$NOW" '
  .updated_at = $now
  | .instances = (.instances
      | map(
          if (.id as $k | $merged[$k]) then
            .state = $merged[.id]
          else
            .
          end
        ))' "$INV" > "$INV.tmp" && mv "$INV.tmp" "$INV"

echo "scanned ${#TARGETS[@]} instance(s)"
```

> 如果要改轮询周期、并发、超时，在调度器环境变量里设 `LANYUN_SSH_TIMEOUT_SEC` / `LANYUN_MAX_PARALLEL` 即可，不用改脚本。

## 五、调度：每分钟跑一次

### Linux / macOS / WSL — crontab

```bash
# 编辑当前用户的 cron 表
crontab -e
```

追加一行（注意 cron 的 PATH 很瘦，把 sshpass/jq 的目录明确带上）：

```
* * * * * PATH=/usr/local/bin:/usr/bin:/bin /bin/bash ~/.openclaw/workspace/knowledge/scan-lanyun.sh >> ~/.openclaw/workspace/knowledge/scan-lanyun.log 2>&1
```

确认：
```bash
crontab -l
tail -n 50 -f ~/.openclaw/workspace/knowledge/scan-lanyun.log
```

### macOS — launchd（可选，cron 也能用）

把下方写进 `~/Library/LaunchAgents/com.openclaw.lanyun-scan.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.openclaw.lanyun-scan</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>~/.openclaw/workspace/knowledge/scan-lanyun.sh</string>
  </array>
  <key>StartInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>/tmp/lanyun-scan.log</string>
  <key>StandardErrorPath</key><string>/tmp/lanyun-scan.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.openclaw.lanyun-scan.plist
```

### Windows — Task Scheduler + WSL

- Task Scheduler 创建任务：Trigger = Daily, Repeat every 1 minute for 1 day
- Action = `C:\Windows\System32\wsl.exe`
- Arguments = `-e bash -lc "~/.openclaw/workspace/knowledge/scan-lanyun.sh >> ~/.openclaw/workspace/knowledge/scan-lanyun.log 2>&1"`

## 六、常用查询命令

```bash
INV=~/.openclaw/workspace/knowledge/lanyun-inventory.json

# 所有机箱简况
jq '.instances[] | {id, status: .state.status, gpu_util: .state.gpu_utilization, last_seen: .state.last_seen_at, ok: .state.last_sync_ok}' "$INV"

# 只看失败的
jq '.instances[] | select(.state.last_sync_ok == false) | {id, err: .state.last_sync_error}' "$INV"

# 按 id 查一台
jq --arg id lanyun-rtx3090-01 '.instances[] | select(.id == $id)' "$INV"

# 标记一条释放（直接就地改）
jq --arg id lanyun-rtx3090-01 --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  .instances |= map(if .id == $id then .released_at = $now | .state.status = "offline" else . end)
' "$INV" > "$INV.tmp" && mv "$INV.tmp" "$INV"

# 更新一台的密码（蓝耘关机重开可能会变）
jq --arg id lanyun-rtx3090-01 --arg pw "新密码明文" '
  .instances |= map(if .id == $id then .ssh_password = $pw else . end)
' "$INV" > "$INV.tmp" && mv "$INV.tmp" "$INV"
```

## 七、调试清单

| 症状 | 检查点 |
|------|--------|
| `crontab -l` 有这一行但脚本没跑 | cron 日志 `grep CRON /var/log/syslog`；很多时候是 PATH 不全导致 sshpass/jq 找不到 |
| `scan-lanyun.log` 全是 `sshpass: command not found` | 装 sshpass；检查 crontab 里的 PATH 是否带上 `/usr/local/bin` |
| 所有机箱 `last_sync_ok=false` | 本机网络可能被公司代理/防火墙拦住 22 端口；试 `curl -v telnet://link.lanyun.net:35123` |
| 某台机箱固定 `Permission denied` | 密码被蓝耘重置（关机重开常见）→ 见 §六"更新密码" |
| `gpu_utilization` 一直 null 但 `last_sync_ok=true` | 容器没开 GPU 透传或 `nvidia-smi` 缺失，指标落空是正常的 |
| JSON 被改坏了 | `jq . ~/.openclaw/workspace/knowledge/lanyun-inventory.json` 确认结构；备份 `.bak` 再覆盖 |
| 扫描非常慢 | 并发数调大：`LANYUN_MAX_PARALLEL=5 bash scan-lanyun.sh`；或拆多个 cron 条目 |

## 八、备份建议

`~/.openclaw/workspace/knowledge/` 是长期状态，建议：

```bash
# 加进本机定时备份；密码明文请只留在本机或私有存储
tar czf ~/openclaw-knowledge-$(date +%Y%m%d).tar.gz -C ~ .openclaw/workspace/knowledge
```

**不要 commit 这个目录**——里面包含云账号密码和每台实例的 root 明文。
