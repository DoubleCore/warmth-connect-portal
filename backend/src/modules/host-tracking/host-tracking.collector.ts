/**
 * 主机指标采集器
 *
 * 通过 SSH 在远程主机上执行一次合并命令，拉回所有指标。
 * 使用工具脚本里的 SSHClient — 同一进程同语言，零额外依赖。
 *
 * 远程命令 (一次 exec 跑完，shell 命令用 `;` 串联，不依赖 bash 特性):
 *   1. nvidia-smi 查询 GPU 多卡指标 (CSV 行)
 *   2. cat /proc/uptime            -> 主机运行时长
 *   3. uname -r                    -> 内核版本
 *   4. hostname                    -> 主机名
 *   5. cat /proc/loadavg           -> 1/5/15 分钟负载
 *   6. free -m                     -> 内存
 *   7. df -P / | tail -n 1         -> 根分区使用率
 *   8. nproc                       -> CPU 核心数 (用来把 loadavg 换算成百分比)
 *
 * 输出之间用易识别的分隔符隔开 (===SECTION===)，前端解析简单可靠。
 */

import { SSHClient } from "@/lib/ssh/ssh-client.js";
import type { GpuMetrics } from "./host-tracking.dto.js";

export interface CollectorAuth {
  password?: string;
  keyFile?: string;
}

export interface CollectorTarget {
  host: string;
  port: number;
  username: string;
  auth: CollectorAuth;
  /** 单次采集的硬超时（毫秒） */
  timeoutMs: number;
}

export interface CollectedMetrics {
  online: true;
  latencyMs: number;
  hostname: string | null;
  kernel: string | null;
  uptimeSeconds: number | null;
  cpuLoad1mPct: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  diskUsedPct: number | null;
  gpus: GpuMetrics[] | null;
}

export interface FailedCollect {
  online: false;
  errorMessage: string;
  latencyMs: number | null;
}

export type CollectResult = CollectedMetrics | FailedCollect;

/**
 * 单条 shell 命令 — 整个采集过程
 *
 * 用 `2>/dev/null || true` 包裹每一段，让某段失败 (例如机器没装 nvidia-smi) 不影响
 * 其它段。section 之间用 SECTION_xxx 标记切分，避免顺序错位时拿错数据。
 */
const REMOTE_PROBE_SCRIPT = `
echo '===SECTION_HOSTNAME==='; hostname 2>/dev/null || true;
echo '===SECTION_KERNEL==='; uname -r 2>/dev/null || true;
echo '===SECTION_UPTIME==='; cat /proc/uptime 2>/dev/null || true;
echo '===SECTION_LOADAVG==='; cat /proc/loadavg 2>/dev/null || true;
echo '===SECTION_NPROC==='; nproc 2>/dev/null || true;
echo '===SECTION_MEM==='; free -m 2>/dev/null || true;
echo '===SECTION_DISK==='; df -P / 2>/dev/null | tail -n 1 || true;
echo '===SECTION_GPU==='; nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>/dev/null || true;
echo '===SECTION_END===';
`.trim();

interface ParsedSections {
  hostname: string;
  kernel: string;
  uptime: string;
  loadavg: string;
  nproc: string;
  mem: string;
  disk: string;
  gpu: string;
}

/** 把整段 stdout 切成 section -> 文本 */
function splitSections(raw: string): Partial<ParsedSections> {
  const out: Partial<ParsedSections> = {};
  const order: (keyof ParsedSections)[] = [
    "hostname",
    "kernel",
    "uptime",
    "loadavg",
    "nproc",
    "mem",
    "disk",
    "gpu",
  ];
  let cursor = 0;
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    if (!name) continue;
    const marker = `===SECTION_${name.toUpperCase()}===`;
    const next = order[i + 1];
    const nextMarker = next ? `===SECTION_${next.toUpperCase()}===` : "===SECTION_END===";

    const start = raw.indexOf(marker, cursor);
    if (start === -1) continue;
    const blockStart = start + marker.length;
    const end = raw.indexOf(nextMarker, blockStart);
    if (end === -1) continue;
    out[name] = raw.slice(blockStart, end).trim();
    cursor = end;
  }
  return out;
}

function parseUptimeSeconds(text: string): number | null {
  // /proc/uptime: "12345.67 9876.54"
  const first = text.split(/\s+/)[0];
  if (!first) return null;
  const n = Number.parseFloat(first);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseLoadavg1m(text: string, nproc: number): number | null {
  // /proc/loadavg: "0.42 0.55 0.66 1/123 4567"
  const first = text.split(/\s+/)[0];
  if (!first) return null;
  const load = Number.parseFloat(first);
  if (!Number.isFinite(load)) return null;
  if (nproc <= 0) return Math.round(load * 100); // 退化处理
  return Math.round((load / nproc) * 100);
}

function parseNproc(text: string): number {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

interface MemSummary {
  usedMb: number | null;
  totalMb: number | null;
}

function parseMem(text: string): MemSummary {
  // free -m 输出形如：
  //               total        used        free      shared  buff/cache   available
  // Mem:          15924        4831        2188         123        8904       10755
  for (const line of text.split("\n")) {
    if (!line.toLowerCase().startsWith("mem:")) continue;
    const cols = line.trim().split(/\s+/);
    // cols: ["Mem:", total, used, ...]
    const total = Number.parseInt(cols[1] ?? "", 10);
    const used = Number.parseInt(cols[2] ?? "", 10);
    return {
      totalMb: Number.isFinite(total) ? total : null,
      usedMb: Number.isFinite(used) ? used : null,
    };
  }
  return { usedMb: null, totalMb: null };
}

function parseDiskPct(text: string): number | null {
  // df -P /: "/dev/sda1  50000000  20000000  30000000  40%  /"
  const cols = text.trim().split(/\s+/);
  // 倒数第二列是百分比
  const pctCol = cols[cols.length - 2];
  if (!pctCol) return null;
  const m = pctCol.match(/^(\d+)%$/);
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function parseGpus(text: string): GpuMetrics[] | null {
  if (!text || text.trim() === "") return null;
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const gpus: GpuMetrics[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 7) continue;
    const [idxStr, name, utilStr, memUsedStr, memTotalStr, tempStr, powerStr] = cols;
    const idx = Number.parseInt(idxStr ?? "", 10);
    if (!Number.isFinite(idx)) continue;
    const util = Number.parseFloat(utilStr ?? "");
    const memUsed = Number.parseFloat(memUsedStr ?? "");
    const memTotal = Number.parseFloat(memTotalStr ?? "");
    const temp = Number.parseFloat(tempStr ?? "");
    const power = Number.parseFloat(powerStr ?? "");
    gpus.push({
      index: idx,
      name: name ?? "",
      utilizationPct: Number.isFinite(util) ? util : 0,
      memoryUsedMb: Number.isFinite(memUsed) ? Math.round(memUsed) : 0,
      memoryTotalMb: Number.isFinite(memTotal) ? Math.round(memTotal) : 0,
      temperatureC: Number.isFinite(temp) ? temp : null,
      powerW: Number.isFinite(power) ? power : null,
    });
  }
  return gpus.length > 0 ? gpus : null;
}

/**
 * 主入口：发起一次采集
 *
 * 失败永远返回 FailedCollect 而不抛出，由调用方决定是否触发退避。
 */
export async function collectMetrics(target: CollectorTarget): Promise<CollectResult> {
  const start = Date.now();
  const client = new SSHClient({
    host: target.host,
    port: target.port,
    username: target.username,
    password: target.auth.password,
    keyFile: target.auth.keyFile,
    timeoutMs: target.timeoutMs,
  });

  try {
    await client.connect();
    const result = await client.exec(REMOTE_PROBE_SCRIPT, { timeoutMs: target.timeoutMs });
    const latencyMs = Date.now() - start;

    if (result.code !== 0 && !result.stdout) {
      return {
        online: false,
        errorMessage: `remote probe exited ${result.code}: ${result.stderr.slice(0, 500)}`,
        latencyMs,
      };
    }

    const sections = splitSections(result.stdout);
    const nproc = parseNproc(sections.nproc ?? "");
    const mem = parseMem(sections.mem ?? "");

    return {
      online: true,
      latencyMs,
      hostname: sections.hostname?.trim() || null,
      kernel: sections.kernel?.trim() || null,
      uptimeSeconds: parseUptimeSeconds(sections.uptime ?? ""),
      cpuLoad1mPct: parseLoadavg1m(sections.loadavg ?? "", nproc),
      memoryUsedMb: mem.usedMb,
      memoryTotalMb: mem.totalMb,
      diskUsedPct: parseDiskPct(sections.disk ?? ""),
      gpus: parseGpus(sections.gpu ?? ""),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      online: false,
      errorMessage: (err as Error).message,
      latencyMs,
    };
  } finally {
    try {
      client.disconnect();
    } catch {
      // 忽略关闭失败 — 已经在错误路径里
    }
  }
}
