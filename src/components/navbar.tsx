"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Moon, Sun, BarChart3, Home, Trophy, BookOpen, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rankings", label: "Rankings" },
  { href: "/academy", label: "Academy" },
]

const bottomNavLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
  { href: "/rankings", label: "Rankings", icon: Trophy },
  { href: "/academy", label: "Learn", icon: BookOpen },
]

export function Navbar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <>
      {/* ── Desktop / Top Nav ── */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-[60px] items-center justify-between">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 shadow-sm">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <span className="text-[17px] font-bold tracking-tight">
                <span className="text-primary">factor</span>
                <span className="text-foreground/60">lens</span>
              </span>
            </Link>

            {/* Desktop Nav links */}
            <div className="hidden md:flex items-center gap-0.5">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
              <Link href="/dashboard">
                <Button
                  size="sm"
                  className="hidden sm:flex h-9 px-4 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 font-semibold shadow-sm"
                >
                  Build Portfolio
                </Button>
              </Link>
            </div>

          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Nav Bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-stretch h-[68px]">
          {bottomNavLinks.map((link) => {
            const isActive = link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 transition-colors active:scale-95",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <link.icon className={cn("h-5 w-5 transition-all", isActive && "scale-110")} />
                <span className={cn(
                  "text-[10px] font-semibold tracking-wide transition-all",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {link.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
