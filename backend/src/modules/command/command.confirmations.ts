/**
 * PendingConfirmationRegistry —— Phase 3 挂起/恢复协调器。
 *
 * 背景（设计文档 §10）：
 *   Hermes 发 need_confirmation 时，Backend 要把执行挂起，等前端返回 confirm/cancel，
 *   再决定是让 Hermes 续跑还是本地落 cancelled 终态。
 *
 * 实现方式：
 *   - runCommand 调用 waitForDecision(confirmationId) 拿到一个 Promise<Decision>
 *     挂起自己
 *   - POST /confirmations/:id handler 调用 resolve(id, decision) 把决策递过去
 *   - 若超时（默认 30 分钟）仍未收到 decision，自动以 cancel 解除挂起
 *
 * 范围：进程内内存。多实例部署同样需要换成 Redis / 消息队列，接口已封装好。
 */
export type ConfirmationDecision =
  | { action: "confirm"; payload?: Record<string, unknown> }
  | { action: "cancel"; payload?: Record<string, unknown> };

type PendingEntry = {
  commandId: string;
  resolve: (decision: ConfirmationDecision) => void;
  /** 自动超时 timer，收到 decision 后 clearTimeout */
  timeout: NodeJS.Timeout;
};

/** 默认 30 分钟：高风险操作的确认窗口，超了算用户放弃，本地 cancel。 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

class PendingConfirmationRegistry {
  private readonly pending = new Map<string, PendingEntry>();

  /**
   * 注册一个等待决策的挂起点。返回一个 Promise，resolve 时表示已拿到前端决策
   * （或超时自动 cancel）。
   */
  waitForDecision(
    confirmationId: string,
    commandId: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<ConfirmationDecision> {
    return new Promise<ConfirmationDecision>((resolve) => {
      const timeout = setTimeout(() => {
        const entry = this.pending.get(confirmationId);
        if (!entry) return;
        this.pending.delete(confirmationId);
        entry.resolve({
          action: "cancel",
          payload: { reason: "confirmation_timeout" },
        });
      }, timeoutMs);
      // 不挂住 event loop：用户退出 / 进程结束不应该被这个 timer 拖住
      if (typeof timeout.unref === "function") timeout.unref();

      this.pending.set(confirmationId, {
        commandId,
        resolve,
        timeout,
      });
    });
  }

  /**
   * 由 POST /confirmations/:id handler 调用。
   * - 如果 confirmationId 存在：resolve 挂起的 Promise，返回对应的 commandId
   * - 不存在：返回 null（confirmation 已失效 / 过期 / 被其它连接抢先处理过）
   */
  resolve(
    confirmationId: string,
    decision: ConfirmationDecision,
  ): { commandId: string } | null {
    const entry = this.pending.get(confirmationId);
    if (!entry) return null;
    this.pending.delete(confirmationId);
    clearTimeout(entry.timeout);
    entry.resolve(decision);
    return { commandId: entry.commandId };
  }

  /**
   * 当 command 自身出错或连接丢失时，清理该 command 下所有挂起的确认项，
   * 避免内存泄漏 + Promise 永远挂住。全部当 cancel 处理。
   */
  cancelAllForCommand(commandId: string): void {
    for (const [cid, entry] of this.pending) {
      if (entry.commandId !== commandId) continue;
      this.pending.delete(cid);
      clearTimeout(entry.timeout);
      entry.resolve({
        action: "cancel",
        payload: { reason: "command_terminated" },
      });
    }
  }

  /** 调试用 */
  size(): number {
    return this.pending.size;
  }
}

export const pendingConfirmations = new PendingConfirmationRegistry();
