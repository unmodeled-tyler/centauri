import { memo } from "react";
import { User } from "lucide-react";
import type { AgentTool } from "../../services/api";
import { MarkdownText } from "./MarkdownText";

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

  if (!isUser) {
    return (
      <div className="px-4 py-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400">{tool?.label ?? "Agent"}</span>
          <span className="text-[10px] text-zinc-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="max-w-none pr-2">
          <MarkdownText content={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-3 px-4 py-3">
      <div className="order-first min-w-0 max-w-[85%]">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400">You</span>
          <span className="text-[10px] text-zinc-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-2.5 text-sm leading-relaxed text-emerald-50">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>

      <div className="mt-0.5 flex-shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700/50 ring-1 ring-zinc-600/30">
          <User className="h-3.5 w-3.5 text-zinc-400" />
        </div>
      </div>
    </div>
  );
});

export default StreamlineMessageComponent;
