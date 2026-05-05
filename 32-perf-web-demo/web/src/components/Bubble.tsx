import type { Msg } from "../types.ts";

export function Bubble({ msg }: { msg: Msg }) {
  const cls =
    msg.role === "user"
      ? "bubble user"
      : msg.status === "pending"
        ? "bubble placeholder"
        : "bubble assistant";
  return <div className={cls}>{msg.content || "..."}</div>;
}
