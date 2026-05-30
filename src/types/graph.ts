export interface GraphNode {
  id: string;
  name: string;
  type: "file" | "folder" | "function" | "class" | "method" | "const" | "interface" | "route" | "unknown";
  filePath?: string;
  group?: string; // directory/module group for clustering
  importance?: number; // for sizing
  description?: string;
  color?: string;
  position?: [number, number, number];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "imports" | "calls" | "contains" | "related" | string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: string[];
}


