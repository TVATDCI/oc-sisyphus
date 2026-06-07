import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'glass-heavy' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="text-xl font-bold gradient-text-brand">
            {{PROJECT_NAME}}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-text-base hover:text-accent-5 transition-colors">
              Home
            </Link>
            <Link to="/features" className="text-text-base hover:text-accent-5 transition-colors">
              Features
            </Link>
            <Link to="/about" className="text-text-base hover:text-accent-5 transition-colors">
              About
            </Link>
            
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="text-text-base hover:text-accent-5 transition-colors">
                  Profile
                </Link>
                {user?.role === 'admin' && (
                  <Link to="/admin" className="text-text-base hover:text-accent-5 transition-colors">
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg bg-accent-1 text-white hover:bg-accent-2 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-text-base hover:text-accent-5 transition-colors">
                  Log In
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-lg bg-accent-5 text-background hover:bg-accent-4 transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-6 h-0.5 bg-text-base mb-1.5"></div>
            <div className="w-6 h-0.5 bg-text-base mb-1.5"></div>
            <div className="w-6 h-0.5 bg-text-base"></div>
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobileNavOpen && (
        <div className="md:hidden glass-heavy">
          <div className="px-4 pt-2 pb-4 space-y-2">
            <Link to="/" className="block py-2 text-text-base hover:text-accent-5">
              Home
            </Link>
            <Link to="/features" className="block py-2 text-text-base hover:text-accent-5">
              Features
            </Link>
            <Link to="/about" className="block py-2 text-text-base hover:text-accent-5">
              About
            </Link>
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="block py-2 text-text-base hover:text-accent-5">
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left py-2 text-accent-1"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="block py-2 text-text-base hover:text-accent-5">
                  Log In
                </Link>
                <Link to="/signup" className="block py-2 text-accent-5">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
