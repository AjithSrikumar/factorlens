"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function SignInPage() {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // If already logged in, redirect to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard")
    })

    const params = new URLSearchParams(window.location.search)
    const urlError = params.get("error")
    if (urlError === "timeout") {
      setError("Sign-in timed out. Please try again.")
    } else if (urlError) {
      // Provider-not-enabled or other Supabase errors forwarded from navbar
      setError(
        urlError.includes("not enabled")
          ? "Google sign-in is not configured yet. Please contact the site admin."
          : decodeURIComponent(urlError)
      )
    }
  }, [router])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success the browser navigates away — no cleanup needed
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      padding: "24px 16px",
    }}>
      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 400,
        background: "var(--surface, #fff)",
        border: "1px solid var(--border-mid)",
        borderRadius: 20,
        padding: "40px 36px",
        boxShadow: "var(--shadow-lg)",
        textAlign: "center",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--text-raw)", marginBottom: 28 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "var(--radius-sm)",
            background: "var(--text-raw)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 18 18" fill="none" style={{ width: 18, height: 18 }}>
              <rect x="2"   y="10" width="3" height="6"  rx="1" fill="white"/>
              <rect x="7.5" y="6"  width="3" height="10" rx="1" fill="white"/>
              <rect x="13"  y="2"  width="3" height="14" rx="1" fill="white"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>factorlens</span>
        </Link>

        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem", fontWeight: 400,
          letterSpacing: "-0.02em",
          color: "var(--text-raw)",
          margin: "0 0 8px",
        }}>
          Welcome back
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.6, margin: "0 0 32px" }}>
          Sign in to access your saved portfolio and risk profile across sessions.
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            padding: "13px 20px",
            background: loading ? "var(--bg3)" : "#ffffff",
            border: "1.5px solid var(--border-mid)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem", fontWeight: 600,
            color: "var(--text-raw)",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            fontFamily: "var(--font-body)",
            boxShadow: "0 1px 4px rgba(0,0,0,.07)",
          }}
          onMouseEnter={e => {
            if (!loading) {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = "var(--text-raw)"
              el.style.boxShadow = "0 2px 8px rgba(0,0,0,.12)"
            }
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = "var(--border-mid)"
            el.style.boxShadow = "0 1px 4px rgba(0,0,0,.07)"
          }}
        >
          {loading ? (
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "2px solid var(--border-mid)",
              borderTopColor: "var(--text-raw)",
              animation: "spin 0.7s linear infinite",
            }} />
          ) : (
            <GoogleIcon />
          )}
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        {error && (
          <p style={{
            marginTop: 16, fontSize: 13,
            color: "#dc2626",
            background: "rgba(220,38,38,.07)",
            border: "1px solid rgba(220,38,38,.2)",
            borderRadius: 8, padding: "10px 14px",
          }}>
            {error}
          </p>
        )}

        {/* Benefits */}
        <div style={{ marginTop: 28, textAlign: "left" }}>
          {[
            "Portfolio saved across all your devices",
            "Risk profile remembered for next visit",
            "No password required — Google handles it",
          ].map(b => (
            <div key={b} style={{
              display: "flex", alignItems: "flex-start", gap: 9,
              marginBottom: 10,
            }}>
              <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0 }}>
                <circle cx="8" cy="8" r="7" fill="rgba(20,184,133,.15)" />
                <path d="M5 8l2 2 4-4" stroke="var(--accent, #14b885)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 28, fontSize: "0.75rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          By signing in you agree to our terms. We never share your data.
          Your investments stay in your own broker account.
        </p>
      </div>

      {/* Back link */}
      <Link href="/" style={{
        marginTop: 20, fontSize: "0.82rem", color: "var(--text-muted)",
        textDecoration: "none", display: "flex", alignItems: "center", gap: 5,
      }}>
        ← Back to home
      </Link>
    </div>
  )
}
