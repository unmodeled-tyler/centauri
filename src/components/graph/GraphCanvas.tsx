import { useRef, useState, useMemo, useCallback, useEffect, createContext, useContext, memo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Html } from "@react-three/drei";
import type { GraphEdge } from "../../types/graph";
import type { LayoutNode } from "./useGraphLayout";
import * as THREE from "three";

const MAX_VISIBLE_EDGES = 500;
const MAX_PULSE_EDGES = 25;
const MAX_IDLE_LABELS = 12;

type AnimFn = (time: number) => void;
const AnimationContext = createContext<{ register: (fn: AnimFn) => () => void } | null>(null);

function useAnimation(fn: AnimFn, deps: unknown[]) {
  const ctx = useContext(AnimationContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFn = useCallback(fn, deps);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(stableFn);
  }, [ctx, stableFn]);
}

const GROUP_COLORS: Record<string, string> = {
  routes: "#3b82f6",
  components: "#8b5cf6",
  services: "#10b981",
  stores: "#f59e0b",
  server: "#ec4899",
  utils: "#22d3ee",
  hooks: "#fb923c",
  src: "#60a5fa",
  default: "#a1a1aa",
};

function getNodeColor(node: LayoutNode): string {
  if (node.color) return node.color;
  const group = node.group || "default";
  const firstSegment = group.split("/")[0] ?? "default";
  return (GROUP_COLORS[group] ?? GROUP_COLORS[firstSegment] ?? GROUP_COLORS.default) as string;
}

const NodeMesh = memo(function NodeMesh({
  node,
  isSelected,
  isHovered,
  showLabel,
  onClick,
  onContextMenu,
  onPointerOver,
  onPointerOut,
}: {
  node: LayoutNode;
  isSelected: boolean;
  isHovered: boolean;
  showLabel: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => getNodeColor(node), [node]);
  const targetScale = isSelected ? 1.4 : isHovered ? 1.2 : 1;

  // Single callback per component — registered into the scene-level animation loop
  useAnimation((t) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    if (isSelected) mesh.rotation.y = t * 0.5;
    const halo = haloRef.current;
    if (halo) {
      const pulse = 1.08 + Math.sin(t * 2.4) * 0.08;
      halo.scale.setScalar(targetScale * pulse);
    }
  }, [isSelected, targetScale]);

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e.nativeEvent); }}
        onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
        onPointerOut={onPointerOut}
      >
        <sphereGeometry args={[node.radius, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.5 : 0.3}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>
      {(isSelected || isHovered) && (
        <mesh ref={haloRef}>
          <sphereGeometry args={[node.radius * 1.8, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.16 : 0.1} depthWrite={false} />
        </mesh>
      )}
      {showLabel && (
        <Html distanceFactor={8} position={[0, node.radius + 0.45, 0]} center style={{ pointerEvents: "none" }}>
          <div
            className={[
              "max-w-44 truncate rounded-md border px-2 py-1 text-[10px] shadow-xl whitespace-nowrap backdrop-blur",
              isSelected || isHovered
                ? "border-cyan-300/40 bg-zinc-950/90 text-zinc-100 shadow-cyan-950/40"
                : "border-zinc-700/70 bg-zinc-950/65 text-zinc-300 shadow-black/30",
            ].join(" ")}
          >
            {node.name}
            {(isSelected || isHovered) && node.type !== "file" && (
              <span className="ml-1 text-zinc-500">({node.type})</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
});

function EdgeLine({ source, target, active }: { source: LayoutNode; target: LayoutNode; active: boolean }) {
  const points = useMemo(
    () => [new THREE.Vector3(source.x, source.y, source.z), new THREE.Vector3(target.x, target.y, target.z)],
    [source.x, source.y, source.z, target.x, target.y, target.z],
  );
  const color = useMemo(() => getNodeColor(target), [target]);

  return <Line points={points} color={color} lineWidth={active ? 1.1 : 0.35} transparent opacity={active ? 0.72 : 0.22} />;
}

function PulseLine({ source, target, speed = 0.4 }: { source: LayoutNode; target: LayoutNode; speed?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const start = useMemo(() => new THREE.Vector3(source.x, source.y, source.z), [source.x, source.y, source.z]);
  const end = useMemo(() => new THREE.Vector3(target.x, target.y, target.z), [target.x, target.y, target.z]);
  const color = useMemo(() => new THREE.Color(getNodeColor(target)), [target]);
  const offsetRef = useRef(Math.random() * 3);

  useAnimation((t) => {
    if (!meshRef.current) return;
    const progress = ((t * speed + offsetRef.current) % 3) / 3;
    meshRef.current.position.lerpVectors(start, end, progress);
    meshRef.current.scale.setScalar(Math.sin(progress * Math.PI) * 0.5 + 0.3);
  }, [speed, start, end]);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.12, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

function NeuralBackground() {
  return (
    <>
      <color attach="background" args={["#09090b"]} />
      <Stars radius={70} depth={55} count={1200} factor={3} saturation={0} fade speed={0.5} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#3b82f6" />
      <pointLight position={[-10, -10, -5]} intensity={0.3} color="#8b5cf6" />
      <pointLight position={[0, 10, -10]} intensity={0.2} color="#10b981" />
    </>
  );
}

function CameraFit({ nodes }: { nodes: LayoutNode[] }) {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (nodes.length === 0) return;

    const center = new THREE.Vector3();
    for (const n of nodes) center.add(new THREE.Vector3(n.x, n.y, n.z));
    center.divideScalar(nodes.length);

    let bound = 0;
    for (const n of nodes) {
      const d = new THREE.Vector3(n.x, n.y, n.z).distanceTo(center);
      if (d > bound) bound = d;
    }

    const dist = Math.max(bound * 2.5, 10);
    camera.position.set(center.x, center.y + dist * 0.3, center.z + dist);
    camera.lookAt(center);
  }, [nodes, camera]);

  return null;
}

function Scene({
  nodes,
  edges,
  selectedId,
  hoveredId,
  onSelect,
  onNodeContextMenu,
  onHover,
}: {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onNodeContextMenu: (node: LayoutNode, event: MouseEvent) => void;
  onHover: (id: string | null) => void;
}) {
  const animFns = useRef<Set<AnimFn>>(new Set());

  const register = useCallback((fn: AnimFn) => {
    animFns.current.add(fn);
    return () => { animFns.current.delete(fn); };
  }, []);

  const ctx = useMemo(() => ({ register }), [register]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    animFns.current.forEach((fn) => fn(t));
  });

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const edgePairs = useMemo(
    () =>
      edges
        .map((e) => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return null;
          return { id: e.id, source: s, target: t };
        })
        .filter(Boolean) as { id: string; source: LayoutNode; target: LayoutNode }[],
    [edges, nodeMap],
  );

  const visibleEdgePairs = useMemo(() => edgePairs.slice(0, MAX_VISIBLE_EDGES), [edgePairs]);

  const activeEdgePairs = useMemo(() => {
    if (!selectedId && !hoveredId) return visibleEdgePairs.slice(0, MAX_PULSE_EDGES);
    const activeId = hoveredId || selectedId;
    return visibleEdgePairs.filter((ep) => ep.source.id === activeId || ep.target.id === activeId);
  }, [hoveredId, selectedId, visibleEdgePairs]);

  const activeEdgeIds = useMemo(() => new Set(activeEdgePairs.map((ep) => ep.id)), [activeEdgePairs]);
  const pulseEdgePairs = useMemo(() => activeEdgePairs.slice(0, MAX_PULSE_EDGES), [activeEdgePairs]);

  const labeledIds = useMemo(() => {
    const labels = new Set<string>();
    if (selectedId) labels.add(selectedId);
    if (hoveredId) labels.add(hoveredId);
    for (const node of [...nodes].sort((a, b) => b.radius - a.radius).slice(0, MAX_IDLE_LABELS)) {
      labels.add(node.id);
    }
    return labels;
  }, [hoveredId, nodes, selectedId]);

  const handlePointerMiss = useCallback(() => onSelect(null), [onSelect]);
  const handleNodeContextMenu = useCallback(
    (node: LayoutNode, event: MouseEvent) => {
      event.preventDefault();
      onSelect(node.id);
      onNodeContextMenu(node, event);
    },
    [onNodeContextMenu, onSelect],
  );

  return (
    <AnimationContext.Provider value={ctx}>
      <CameraFit nodes={nodes} />
      <NeuralBackground />
      <group onPointerMissed={handlePointerMiss}>
        {visibleEdgePairs.map((ep) => (
          <EdgeLine key={ep.id} source={ep.source} target={ep.target} active={activeEdgeIds.has(ep.id)} />
        ))}
        {pulseEdgePairs.map((ep) => (
          <PulseLine key={`pulse-${ep.id}`} source={ep.source} target={ep.target} speed={0.3} />
        ))}
        {nodes.map((node) => (
          <NodeMesh
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            isHovered={hoveredId === node.id}
            showLabel={labeledIds.has(node.id)}
            onClick={() => onSelect(node.id)}
            onContextMenu={(event) => handleNodeContextMenu(node, event)}
            onPointerOver={() => onHover(node.id)}
            onPointerOut={() => onHover(null)}
          />
        ))}
      </group>
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={500}
      />
    </AnimationContext.Provider>
  );
}

export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onOpenFile,
}: {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenFile: (path: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: LayoutNode } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNodeContextMenu = useCallback((node: LayoutNode, event: MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setContextMenu({
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
      node,
    });
  }, []);

  const handleOpenFile = useCallback(() => {
    if (contextMenu?.node.filePath) {
      onOpenFile(contextMenu.node.filePath);
      setContextMenu(null);
    }
  }, [contextMenu, onOpenFile]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) setContextMenu(null);
      }}
    >
      <Canvas
        camera={{ position: [0, 5, 30], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Scene
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={onSelect}
          onNodeContextMenu={handleNodeContextMenu}
          onHover={setHoveredId}
        />
      </Canvas>
      {contextMenu && (
        <div
          className="absolute z-20 min-w-48 overflow-hidden rounded-md border border-cyan-400/20 bg-zinc-950/95 py-1 text-xs text-zinc-200 shadow-2xl shadow-cyan-950/30 backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-zinc-800 px-3 py-2">
            <div className="truncate font-medium text-zinc-100">{contextMenu.node.name}</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-zinc-500">{contextMenu.node.type}</div>
          </div>
          <button
            type="button"
            disabled={!contextMenu.node.filePath}
            onClick={handleOpenFile}
            className="flex w-full items-center px-3 py-2 text-left transition-colors enabled:hover:bg-cyan-400/10 enabled:hover:text-cyan-100 disabled:cursor-not-allowed disabled:text-zinc-600"
          >
            Open file in Explorer
          </button>
        </div>
      )}
    </div>
  );
}
