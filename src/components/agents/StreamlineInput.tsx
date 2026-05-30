import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Send, Square } from "lucide-react";

const StreamlineInputComponent = memo(function StreamlineInput({
  onSend,
  onStop,
  disabled,
  busy = false,
  placeholder = "Message your agent...",
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  busy?: boolean;
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
    if (!trimmed || disabled || busy) return;
    onSend(trimmed);
    setValue("");
  };

  const handleButtonClick = () => {
    if (busy) {
      onStop?.();
      return;
    }
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-zinc-800/60 bg-zinc-950/90 px-4 py-3">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled || busy}
        placeholder={placeholder}
        className="min-h-[40px] max-h-[200px] w-full resize-none rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        onClick={handleButtonClick}
        disabled={busy ? !onStop : disabled || !value.trim()}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
          busy
            ? "bg-red-500/90 text-white hover:bg-red-400"
            : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
        }`}
        aria-label={busy ? "Stop agent" : "Send message"}
        title={busy ? "Stop agent" : "Send message"}
      >
        {busy ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  );
});

export default StreamlineInputComponent;
