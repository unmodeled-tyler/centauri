import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Send, Square } from "lucide-react";

const StreamlineInputComponent = memo(function StreamlineInput({
  onSend,
  onStop,
  disabled,
  busy = false,
  queuedCount = 0,
  placeholder = "Message your agent...",
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  busy?: boolean;
  queuedCount?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-zinc-800/60 bg-zinc-950/90 px-4 py-3">
      {busy && (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>{queuedCount > 0 ? `${queuedCount} queued follow-up${queuedCount === 1 ? "" : "s"}` : "Agent is working"}</span>
          {onStop && (
            <button
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          className="min-h-[40px] max-h-[200px] w-full resize-none rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={busy ? "Queue message" : "Send message"}
          title={busy ? "Queue message" : "Send message"}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

export default StreamlineInputComponent;
