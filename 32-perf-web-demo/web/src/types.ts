export type Role = "user" | "assistant";

export interface Msg {
  id: string;
  role: Role;
  content: string;
  status: "complete" | "streaming" | "pending" | "error";
}

export interface Stats {
  ttft_ms?: number;
  total_ms?: number;
  output_tokens?: number;
}
