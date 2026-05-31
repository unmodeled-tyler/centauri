import { memo } from "react";
import { AlertCircle, CheckCircle2, Loader2, Terminal, User } from "lucide-react";
import type { AgentTool } from "../../services/api";
import { MarkdownText } from "./MarkdownText";

export interface StreamlineActivity {
  id: string;
  callId?: string;
  title: string;
  detail?: string;
  status?: "running" | "done" | "error";
}

export interface StreamlineMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  activities?: StreamlineActivity[];
  streaming?: boolean;
  queued?: boolean;
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
  const activities = message.activities ?? [];

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
          {activities.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/35 px-2.5 py-2"
                >
                  <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    {activity.status === "error" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-300" />
                    ) : activity.status === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    ) : activity.status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    ) : (
                      <Terminal className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-zinc-300">{activity.title}</div>
                    {activity.detail && (
                      <div className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] leading-4 text-zinc-500">
                        {activity.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {message.content ? (
            <MarkdownText content={message.content} />
          ) : message.streaming ? (
            <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-3 px-4 py-3">
      <div className="order-first min-w-0 max-w-[85%]">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400">You</span>
          {message.queued && (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              Queued
            </span>
          )}
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
