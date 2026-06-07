/* eslint-disable react-refresh/only-export-components */
import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'

// Particle field component
const ParticleField = ({ count = 2000, reducedMotion }) => {
  const pointsRef = useRef()
  
  // Generate particle data once using useState with lazy initializer
  // This satisfies ESLint react-hooks/purity rule
  const [particles] = useState(() => ({
    positions: new Float32Array(
      Array.from({ length: count * 3 }, () => (Math.random() - 0.5) * 20)
    ),
    colors: new Float32Array(
      Array.from({ length: count * 3 }, () => Math.random())
    ),
    sizes: new Float32Array(
      Array.from({ length: count }, () => Math.random() * 0.5 + 0.1)
    )
  }))

  useFrame((state) => {
    if (!pointsRef.current || reducedMotion) return
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02
    pointsRef.current.rotation.x = state.clock.elapsedTime * 0.01
  })

  if (reducedMotion) {
    count = Math.floor(count * 0.1) // Reduce particles for reduced motion
  }

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions.slice(0, count * 3)}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={particles.colors.slice(0, count * 3)}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// Floating orbs component
const FloatingOrbs = ({ reducedMotion }) => {
  const groupRef = useRef()
  
  const orbs = useMemo(() => [
    { color: '#ffd960', position: [3, 2, -5], size: 0.5 },
    { color: '#859f3d', position: [-4, -1, -6], size: 0.4 },
    { color: '#f06966', position: [2, -3, -4], size: 0.6 },
    { color: '#858dff', position: [-3, 3, -7], size: 0.35 },
    { color: '#ffffff', position: [0, 0, -8], size: 0.3 },
  ], [])

  useFrame((state) => {
    if (!groupRef.current || reducedMotion) return
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.05
    groupRef.current.children.forEach((child, i) => {
      child.position.y = orbs[i].position[1] + Math.sin(state.clock.elapsedTime + i) * 0.3
    })
  })

  if (reducedMotion) return null

  return (
    <group ref={groupRef}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position}>
          <sphereGeometry args={[orb.size, 32, 32]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

// Camera rig with mouse interaction
const CameraRig = () => {
  const cameraRef = useRef()
  const mouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useFrame((state) => {
    if (!state.camera) return
    // Smooth camera movement based on mouse position
    state.camera.position.x += (mouseRef.current.x * 0.5 - state.camera.position.x) * 0.02
    state.camera.position.y += (mouseRef.current.y * 0.3 - state.camera.position.y) * 0.02
    state.camera.lookAt(0, 0, 0)
  })

  return null
}

// Main scene component
const Scene = ({ reducedMotion }) => {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#858dff" />
      
      <fog attach="fog" args={['#1a1a2e', 5, 30]} />
      
      <ParticleField count={reducedMotion ? 200 : 2000} reducedMotion={reducedMotion} />
      <FloatingOrbs reducedMotion={reducedMotion} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <CameraRig />
    </>
  )
}

// Main export component
const Scene3D = () => {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)
    
    const handleChange = (e) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}

export default Scene3D
