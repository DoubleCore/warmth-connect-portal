import { z } from "zod";

/** GPU 单卡指标（一台主机的 nvidia-smi 输出会包含多张卡） */
export const gpuMetricsSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  utilizationPct: z.number().min(0).max(100),
  memoryUsedMb: z.number().int().nonnegative(),
  memoryTotalMb: z.number().int().nonnegative(),
  temperatureC: z.number().nullable(),
  powerW: z.number().nullable(),
});
export type GpuMetrics = z.infer<typeof gpuMetricsSchema>;

/**
 * 主机创建 / 更新请求体
 *
 * 认证字段二选一：
 *   · password 走 AES-GCM 加密入库
 *   · keyFile 是私钥路径，明文存
 * 两者都填以 password 优先（与 SSH 工具行为一致）。
 */
const baseHostFields = {
  /** 关联的 device 主键，必须先存在于 devices 表 */
  deviceId: z.string().min(1),
  /** Tailscale 内网 IP 或常规 IP/主机名 */
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1),
  password: z.string().min(1).optional(),
  keyFile: z.string().min(1).optional(),
  hostLabel: z.string().nullish(),
  trackingEnabled: z.boolean().default(true),
};

export const createHostSchema = z
  .object(baseHostFields)
  .refine((v) => Boolean(v.password) || Boolean(v.keyFile), {
    message: "Either password or keyFile is required",
    path: ["password"],
  });
export type CreateHostInput = z.infer<typeof createHostSchema>;

export const updateHostSchema = z
  .object({
    host: baseHostFields.host.optional(),
    port: baseHostFields.port.optional(),
    username: baseHostFields.username.optional(),
    /** null 表示清除已有密码 */
    password: z.union([z.string().min(1), z.null()]).optional(),
    /** null 表示清除已有 keyFile */
    keyFile: z.union([z.string().min(1), z.null()]).optional(),
    hostLabel: z.string().nullish(),
    trackingEnabled: z.boolean().optional(),
  })
  .strict();
export type UpdateHostInput = z.infer<typeof updateHostSchema>;

/** 历史指标查询参数 */
export const metricsQuerySchema = z.object({
  /** 起始时间 (ISO)，默认 24 小时前 */
  since: z.string().datetime().optional(),
  /** 结束时间 (ISO)，默认 now */
  until: z.string().datetime().optional(),
  /** 最多返回多少条，默认 200，最大 1000 */
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;

/**
 * 对前端的 DTO 形状 — 永远不返回密码相关字段
 */
export type HostDto = {
  deviceId: string;
  host: string;
  port: number;
  username: string;
  /** 仅返回 boolean 标识是否已配置，不返回密文 */
  hasPassword: boolean;
  keyFile: string | null;
  hostLabel: string | null;
  trackingEnabled: boolean;
  consecutiveFailures: number;
  backoffUntil: string | null;
  lastError: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HostMetricsDto = {
  id: string;
  deviceId: string;
  online: boolean;
  latencyMs: number | null;
  hostname: string | null;
  kernel: string | null;
  uptimeSeconds: number | null;
  cpuLoad1m: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  diskUsedPct: number | null;
  gpus: GpuMetrics[] | null;
  errorMessage: string | null;
  collectedAt: string;
};

/** 单台主机的"主机基本信息 + 最新一次快照"组合视图 */
export type HostWithLatestMetricsDto = HostDto & {
  latestMetrics: HostMetricsDto | null;
};
