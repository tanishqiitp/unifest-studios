import { Environment, Lightformer } from '@react-three/drei'

// Soft studio reflections so gold, chrome and steel read as metal instead of black.
// Rendered once into a small cube map (frames={1}), so it costs nothing per frame.
export function StudioEnv() {
  return (
    <Environment resolution={64} frames={1}>
      {/* A soft grey surround: mirror finishes reflect this instead of black. */}
      <color attach="background" args={['#5a5a5a']} />
      <Lightformer form="rect" intensity={2} position={[0, 8, -12]} scale={[24, 6, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[-14, 5, 6]} rotation-y={Math.PI / 2} scale={[18, 4, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[14, 5, 6]} rotation-y={-Math.PI / 2} scale={[18, 4, 1]} />
      <Lightformer form="ring" intensity={1.5} position={[0, 14, 4]} rotation-x={Math.PI / 2} scale={8} />
    </Environment>
  )
}
