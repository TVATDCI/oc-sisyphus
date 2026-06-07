import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

// Lazy load 3D scene for code splitting
const Scene3D = lazy(() => import('../components/Scene3D.jsx'))

const Home = () => {
  return (
    <div className="relative min-h-screen">
      {/* 3D Background */}
      <Suspense fallback={<div className="absolute inset-0 bg-background-alt" />}>
        <Scene3D />
      </Suspense>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 gradient-text-prime">
            Welcome to {{PROJECT_NAME}}
          </h1>
          <p className="text-xl md:text-2xl text-text-muted mb-8 max-w-3xl mx-auto">
            A stunning portfolio built with React, Tailwind CSS, and Three.js
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/features"
              className="px-8 py-3 rounded-lg bg-accent-5 text-background font-semibold hover:bg-accent-4 transition-colors"
            >
              Explore Features
            </Link>
            <Link
              to="/about"
              className="px-8 py-3 rounded-lg border border-accent-5 text-accent-5 font-semibold hover:bg-accent-5/10 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Features Preview */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-light rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-2">🎨 Modern Design</h3>
              <p className="text-text-muted">Stunning visuals with Tailwind CSS v4 and custom animations</p>
            </div>
            <div className="glass-light rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-2">⚡ Fast Performance</h3>
              <p className="text-text-muted">Optimized with Vite and lazy-loaded components</p>
            </div>
            <div className="glass-light rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-2">🎭 3D Experience</h3>
              <p className="text-text-muted">Immersive Three.js scenes with particle systems</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center glass rounded-2xl p-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-text-muted mb-8">
            Join thousands of users already using our platform
          </p>
          <Link
            to="/signup"
            className="px-8 py-3 rounded-lg bg-accent-1 text-white font-semibold hover:bg-accent-2 transition-colors inline-block"
          >
            Sign Up Now
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Home
