import { memo } from "react";
import { Bot, User } from "lucide-react";
import type { AgentTool } from "../../services/api";

export interface StreamlineMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
}

const StreamlineMessageComponent = memo(function StreamlineMessage({
  message,
  tool,
}: {
  message: StreamlineMessage;
  tool: AgentTool | null;
}) {
  if (message.role === "system") {
    return (
      <div className="flex items-center justify-center px-4 py-2">
        <span className="text-[11px] text-zinc-600 font-mono">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        </div>
      )}

      <div className={`min-w-0 max-w-[85%] ${isUser ? "order-first" : ""}`}>
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400">
            {isUser ? "You" : tool?.label ?? "Agent"}
          </span>
          <span className="text-[10px] text-zinc-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-emerald-500/15 text-emerald-50 border border-emerald-500/20"
              : "bg-zinc-800/50 text-zinc-200 border border-zinc-700/40"
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700/50 ring-1 ring-zinc-600/30">
            <User className="h-3.5 w-3.5 text-zinc-400" />
          </div>
        </div>
      )}
    </div>
  );
});

export default StreamlineMessageComponent;
