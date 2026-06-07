import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="text-center">
        <h1 className="text-8xl md:text-9xl font-bold gradient-text-brand animate-pulse mb-4">
          404
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Page Not Found
        </h2>
        <p className="text-text-muted mb-8 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="px-8 py-3 rounded-lg bg-accent-5 text-background font-semibold hover:bg-accent-4 transition-colors inline-block"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

export default NotFound
