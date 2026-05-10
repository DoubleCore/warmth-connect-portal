import type { CommandEventRow } from "@/db/schema.js";
import type { CommandEventRowWithSeq } from "./command.repository.js";

/**
 * CommandEventBus —— 进程内广播 Backend 侧 CommandStreamEvent。
 *
 * 需求背景（Hermes_Command_Center_HTTP_直连可用版.md §5.3 / §14 第二阶段）：
 *  - Backend 后台线程（runCommand）边收到 Hermes 事件边写 DB
 *  - 同时 `GET /commands/:id/stream` 的 SSE handler 需要实时拿到这些事件
 *  - 支持一条 command 的多个订阅者（刷新页面、多 tab），避免只绑单连接
 *  - SSE 中断重连时：先从 DB 回放历史，再订阅 bus 拿增量
 *
 * MVP 实现用 "EventRow + listener set"：
 *  - publish 会把事件同步派发给当前所有订阅者
 *  - 订阅者按需自行过滤 id > lastEventId 做去重
 *  - command 结束时 publish 终止信号，订阅者据此关 SSE
 *
 * 如果后续要跨进程（多实例部署），把这个接口实现换成 Redis pub/sub 即可，
 * 上层 service / route 完全不用动。
 */

export type BusEvent =
  | { kind: "event"; row: CommandEventRowWithSeq }
  // 表示 command 终态已落库、不会再有新事件。SSE handler 据此关闭连接。
  | { kind: "end" };

type Listener = (ev: BusEvent) => void;

class CommandEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  /**
   * 订阅某条 command 的后续事件。返回取消函数。
   * 注意：这里不会回放历史事件；历史事件由订阅方自行从 DB 读一次。
   */
  subscribe(commandId: string, listener: Listener): () => void {
    let set = this.listeners.get(commandId);
    if (!set) {
      set = new Set();
      this.listeners.set(commandId, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(commandId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(commandId);
    };
  }

  /** 广播一个新事件。listener 的异常被吞掉，避免一个坏订阅者阻塞其他订阅者。 */
  publishEvent(commandId: string, row: CommandEventRowWithSeq): void {
    const set = this.listeners.get(commandId);
    if (!set) return;
    for (const l of set) {
      try {
        l({ kind: "event", row });
      } catch {
        // 静默：SSE 断连时 writer 写入会抛，不是我们关心的错误
      }
    }
  }

  /** command 终态已落库时调用。订阅者收到后应关掉 SSE。 */
  publishEnd(commandId: string): void {
    const set = this.listeners.get(commandId);
    if (!set) return;
    for (const l of set) {
      try {
        l({ kind: "end" });
      } catch {
        // 同上
      }
    }
    // end 后清理订阅表，保持内存干净
    this.listeners.delete(commandId);
  }

  /** 调试用：当前某 command 的订阅者数量 */
  subscribersOf(commandId: string): number {
    return this.listeners.get(commandId)?.size ?? 0;
  }
}

export const commandEventBus = new CommandEventBus();
// CommandEventRow 仅作为历史导出保留兼容
export type { CommandEventRow };
