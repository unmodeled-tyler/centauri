export function CentauriMark({
  className = "h-5 w-5",
  variant = "app",
}: {
  className?: string;
  variant?: "app" | "agent";
}) {
  const isAgent = variant === "agent";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      aria-hidden="true"
    >
      <span
        className={`absolute rounded-full blur-md ${
          isAgent ? "h-4/5 w-4/5 bg-violet-400/25" : "h-4/5 w-4/5 bg-cyan-300/25"
        }`}
      />
      <span
        className={`absolute h-[72%] w-[72%] rounded-full border ${
          isAgent ? "border-violet-300/70" : "border-cyan-300/70"
        } rotate-[-28deg] scale-x-125`}
      />
      <span
        className={`absolute h-[34%] w-[34%] rounded-full ${
          isAgent
            ? "bg-violet-200 shadow-[0_0_12px_rgba(196,181,253,0.9)]"
            : "bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,0.9)]"
        }`}
      />
      <span
        className={`absolute rounded-full ${
          isAgent
            ? "right-[8%] top-[18%] h-[22%] w-[22%] bg-fuchsia-300 shadow-[0_0_10px_rgba(240,171,252,0.8)]"
            : "right-[10%] top-[18%] h-[18%] w-[18%] bg-indigo-300 shadow-[0_0_9px_rgba(165,180,252,0.8)]"
        }`}
      />
      {isAgent && (
        <>
          <span className="absolute bottom-[12%] left-[14%] h-[16%] w-[16%] rounded-full bg-cyan-200 shadow-[0_0_8px_rgba(165,243,252,0.8)]" />
          <span className="absolute h-[44%] w-px rotate-45 bg-violet-200/45" />
        </>
      )}
    </span>
  );
}
