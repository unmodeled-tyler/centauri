import type { FileTreeNode, FileNodeType } from "../../types/git";

export function buildFileTree(files: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  for (const file of files) {
    const parts = file.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const type: FileNodeType = isLast ? "file" : "directory";

      let node = dirMap.get(currentPath);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type,
          children: type === "directory" ? [] : undefined,
        };
        dirMap.set(currentPath, node);
        current.push(node);
      }

      if (type === "directory" && node.children) {
        current = node.children;
      }
    }
  }

  return root;
}
