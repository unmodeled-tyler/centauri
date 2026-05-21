import { useEffect, useRef, useCallback } from "react";
import { useRepoStore } from "../stores/repoStore";
import { useSettingsStore } from "../stores/settingsStore";
import * as api from "../services/api";
import type { View } from "../components/layout/MainLayout";

const INPUT_ELEMENTS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useKeyboardShortcuts({
  view,
  onViewChange,
  selectedFile,
  onSelectFile,
  onConfirmDiscard,
}: {
  view: View;
  onViewChange: (view: View) => void;
  selectedFile: { path: string } | null;
  onSelectFile: (file: null) => void;
  onConfirmDiscard: (path: string) => void;
}) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const status = useRepoStore((s) => s.status);
  const refresh = useRepoStore((s) => s.refresh);
  const settings = useSettingsStore((s) => s.settings);

  const metaRef = useRef({
    repoPath,
    status,
    view,
    selectedFile,
    settings,
    refresh,
    onViewChange,
    onSelectFile,
    onConfirmDiscard,
  });

  metaRef.current = {
    repoPath,
    status,
    view,
    selectedFile,
    settings,
    refresh,
    onViewChange,
    onSelectFile,
    onConfirmDiscard,
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = INPUT_ELEMENTS.has(target.tagName) || target.isContentEditable;
    const meta = metaRef.current;

    if (e.key >= "1" && e.key <= "7") {
      if (isInput) return;
      const views: View[] = ["status", "diff", "branches", "log", "rebase", "stats", "stashes"];
      const index = Number.parseInt(e.key, 10) - 1;
      if (views[index]) {
        e.preventDefault();
        meta.onViewChange(views[index]);
      }
      return;
    }

    if (isInput) return;
    if (!meta.selectedFile) return;

    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      const file = meta.status?.files.find((f) => f.path === meta.selectedFile!.path);
      if (!file) return;
      if (file.stagedStatus === "staged" || file.stagedStatus === "partially_staged") {
        void api.unstageFiles(meta.repoPath!, [file.path]).then(() => meta.refresh()).catch(() => {});
      } else {
        void api.stageFiles(meta.repoPath!, [file.path]).then(() => meta.refresh()).catch(() => {});
      }
      return;
    }

    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      void api.unstageFiles(meta.repoPath!, [meta.selectedFile.path]).then(() => meta.refresh()).catch(() => {});
      return;
    }

    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      if (meta.settings.confirmDiscard) {
        meta.onConfirmDiscard(meta.selectedFile.path);
        return;
      }
      void api.discardChanges(meta.repoPath!, [meta.selectedFile.path]).then(() => {
        meta.refresh();
        meta.onSelectFile(null);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
