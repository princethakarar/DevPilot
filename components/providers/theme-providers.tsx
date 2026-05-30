"use client"

import * as React from "react"

type Theme = "light" | "dark" | "system"

const ThemeContext = React.createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: "system", setTheme: () => {} })

export function useTheme() {
  return React.useContext(ThemeContext)
}

export function ThemeProvider({ children, ..._props }: { children: React.ReactNode; [key: string]: any }) {
  const [theme, setThemeState] = React.useState<Theme>("system")

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("theme") as Theme | null
      const initial = stored ?? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      setThemeState(initial)
      applyTheme(initial)
    } catch (e) {
      // ignore
    }
  }, [])

  function applyTheme(t: Theme) {
    const root = document.documentElement
    if (t === "system") {
      root.classList.remove("light", "dark")
    } else {
      root.classList.remove(t === "dark" ? "light" : "dark")
      root.classList.add(t)
    }
  }

  function setTheme(t: Theme) {
    try {
      localStorage.setItem("theme", t)
    } catch (e) {}
    setThemeState(t)
    applyTheme(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider