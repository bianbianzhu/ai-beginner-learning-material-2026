/**
 * 消息状态机：
 *   streaming → done | error
 *   streaming → aborted（用户点"停止"）
 */
export type MsgStatus = "streaming" | "done" | "error" | "aborted";

export type ToolCallView = {
  id: string;
  name: string;
  /** 随 tool_args_delta 不断追加的 JSON 字符串（可能不是合法 JSON，最后一帧才合法） */
  argsText: string;
  result?: unknown;
  /** "pending" = args 还没填完；"running" = args 填完、后端在跑；"done" = 结果已返回 */
  phase: "pending" | "running" | "done";
};

export type Msg =
  | {
      id: string;
      role: "user";
      content: string;
      status: "done";
      createdAt: number;
    }
  | {
      id: string;
      role: "assistant";
      content: string;
      status: MsgStatus;
      createdAt: number;
      /** 本条 assistant 回复里用到的工具调用（按出现顺序） */
      toolCalls: ToolCallView[];
      errorMessage?: string;
    };
