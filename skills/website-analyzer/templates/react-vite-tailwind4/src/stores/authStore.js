import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,

  login: (token, user, role = 'user') => {
    set({ token, user, role, isAuthenticated: true, isLoading: false })
  },

  logout: () => {
    set({ token: null, user: null, role: null, isAuthenticated: false, isLoading: false })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setUser: (user) => set({ user }),
}))
