import { useEffect, useRef, useState } from 'react'

const FeatureCard = ({ title, description, icon, planet = 'gold', index = 0 }) => {
  const [isVisible, setIsVisible] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px 25% 0px' }
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const planetClasses = {
    gold: 'planet-gold',
    green: 'planet-green',
    orange: 'planet-orange',
    purple: 'planet-purple',
    white: 'planet-white',
    prime: 'planet-prime',
  }

  return (
    <div
      ref={cardRef}
      className={`glass-light rounded-2xl p-6 relative overflow-hidden transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      {/* Gradient border effect */}
      <div className={`absolute inset-0 ${planetClasses[planet]} opacity-10`}></div>
      
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl ${planetClasses[planet]} flex items-center justify-center mb-4`}>
        <span className="text-2xl">{icon}</span>
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold mb-2 text-text-base">{title}</h3>
      <p className="text-text-muted">{description}</p>
    </div>
  )
}

export default FeatureCard
