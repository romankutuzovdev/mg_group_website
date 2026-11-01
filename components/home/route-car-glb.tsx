"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshPhysicalMaterial, Vector3 } from "three";

const MODEL_URL = "/models/car-concept.glb";

type Props = {
  progress: number;
  tiltX?: number;
  tiltY?: number;
  className?: string;
  reduced?: boolean;
};

function GrandTourer({ tiltX = 12, tiltY = -18, reduced = false }: Props) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const customize = (source: MeshPhysicalMaterial) => {
        const material = source.clone();
        if (material.name.startsWith("Paint 1")) {
          material.color.set("#687d89");
          material.metalness = 0.85;
          material.roughness = 0.22;
          material.clearcoat = 1;
          material.clearcoatRoughness = 0.12;
        }
        if (material.name.startsWith("Paint 2")) {
          material.color.set("#242a30");
          material.roughness = 0.3;
        }
        material.envMapIntensity = 1.2;
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => customize(material as MeshPhysicalMaterial))
        : customize(object.material as MeshPhysicalMaterial);
    });
    copy.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(copy);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const scale = 4.6 / Math.max(size.x, size.y, size.z);
    copy.scale.multiplyScalar(scale);
    copy.position.set(-center.x * scale, -bounds.min.y * scale - 0.45, -center.z * scale);
    return copy;
  }, [scene]);

  useEffect(() => () => {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }, [model]);

  return <group rotation={[0, -Math.PI / 2 + (reduced ? 0 : tiltY * Math.PI / 720), 0]}>
    <group rotation={[reduced ? 0 : tiltX * Math.PI / 1800, 0, 0]}>
      <primitive object={model} />
    </group>
  </group>;
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="flex h-full items-center justify-center text-xs text-white/60">3D-просмотр недоступен</p> : this.props.children;
  }
}

export function RouteCarGlb({ className = "", ...props }: Props) {
  return (
    <div className={`h-36 w-60 overflow-visible sm:h-40 sm:w-72 ${className}`} aria-hidden>
      <ModelBoundary>
        <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [5.8, 2.5, 7.2], fov: 32, near: 0.1, far: 40 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} style={{ background: "transparent" }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 3]} intensity={2.5} color="#ffffff" />
          <directionalLight position={[-4, 2, -3]} intensity={1.3} color="#c5d6e8" />
          <Suspense fallback={null}>
            <GrandTourer {...props} />
            <ContactShadows position={[0, -0.46, 0]} opacity={0.5} scale={9} blur={2.5} far={3} frames={1} />
            <Environment resolution={128} frames={1}>
              <Lightformer form="rect" intensity={4} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 3, 1]} />
              <Lightformer form="rect" intensity={3} position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[5, 2, 1]} />
              <Lightformer form="rect" intensity={2} position={[4, 1, 4]} rotation={[0, -Math.PI / 4, 0]} scale={[6, 1, 1]} />
            </Environment>
          </Suspense>
        </Canvas>
      </ModelBoundary>
    </div>
  );
}
