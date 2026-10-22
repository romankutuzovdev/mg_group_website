"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, useGLTF } from "@react-three/drei";
import type { Group } from "three";

const MODEL_URL = "/models/sedan-sports.glb";

type CarMeshProps = {
  progress: number;
  tiltX: number;
  tiltY: number;
  reduced?: boolean;
};

function SportsSedan({ progress, tiltX, tiltY, reduced }: CarMeshProps) {
  const group = useRef<Group>(null);
  const { scene } = useGLTF(MODEL_URL);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    // Base orientation: nose to the right along the route
    const yaw = (-28 + tiltY * 0.9) * (Math.PI / 180);
    const pitch = (6 + tiltX * 0.35) * (Math.PI / 180);
    const bob = reduced ? 0 : Math.sin(t * 2.2 + progress * 6) * 0.03;
    const roll = reduced ? 0 : Math.sin(t * 1.6) * 0.025;
    group.current.rotation.set(pitch + roll * 0.4, yaw, roll);
    group.current.position.y = bob;
  });

  return (
    <group ref={group} scale={0.92} position={[0, -0.15, 0]}>
      <primitive object={cloned} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

type Props = {
  progress: number;
  tiltX?: number;
  tiltY?: number;
  className?: string;
  reduced?: boolean;
};

/** Real GLB car (Kenney Car Kit · sedan-sports · CC0). */
export function RouteCarGlb({
  progress,
  tiltX = 12,
  tiltY = -18,
  className = "",
  reduced = false,
}: Props) {
  return (
    <div
      className={`h-28 w-40 overflow-visible sm:h-32 sm:w-48 ${className}`}
      aria-hidden
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [2.4, 1.35, 3.2], fov: 32, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[4, 6, 2]}
          intensity={1.35}
          color="#ffffff"
          castShadow={false}
        />
        <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#86efac" />
        <spotLight
          position={[0, 4, 2]}
          intensity={0.7}
          angle={0.5}
          penumbra={0.6}
          color="#22c55e"
        />
        <Suspense fallback={null}>
          <SportsSedan
            progress={progress}
            tiltX={tiltX}
            tiltY={tiltY}
            reduced={reduced}
          />
          <ContactShadows
            position={[0, -0.55, 0]}
            opacity={0.55}
            scale={6}
            blur={2.4}
            far={3}
            color="#000000"
          />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
