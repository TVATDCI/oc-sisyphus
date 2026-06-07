/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Layout from './Layout.jsx'

// Lazy load all pages for code splitting
const Home = lazy(() => import('./pages/Home.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
// Add more pages as needed:
// const Projects = lazy(() => import('./pages/Projects.jsx'))
// const About = lazy(() => import('./pages/About.jsx'))
// const Features = lazy(() => import('./pages/Features.jsx'))
// const Signup = lazy(() => import('./pages/Signup.jsx'))
// const Profile = lazy(() => import('./pages/Profile.jsx'))
// const Admin = lazy(() => import('./pages/Admin.jsx'))

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-pulse text-n-3 font-mono">Loading...</div>
  </div>
)

// Router configuration
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { 
        index: true, 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        ) 
      },
      { 
        path: 'login', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        ) 
      },
      // Add more routes:
      // { path: 'projects', element: <Suspense fallback={<PageLoader />}><Projects /></Suspense> },
      // { path: 'about', element: <Suspense fallback={<PageLoader />}><About /></Suspense> },
      // { path: 'features', element: <Suspense fallback={<PageLoader />}><Features /></Suspense> },
      // { path: 'signup', element: <Suspense fallback={<PageLoader />}><Signup /></Suspense> },
      // { path: 'profile', element: <Suspense fallback={<PageLoader />}><Profile /></Suspense> },
      // { path: 'admin', element: <Suspense fallback={<PageLoader />}><Admin /></Suspense> },
      { 
        path: '*', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <NotFound />
          </Suspense>
        ) 
      },
    ],
  },
])
