"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

/**
 * OAuth callback page.
 * Supabase redirects here after Google OAuth with either:
 *   ?code=xxx   (PKCE flow — default in v2)
 *   #access_token=xxx  (implicit — fallback)
 *
 * The Supabase JS client automatically handles both cases via
 * detectSessionInUrl. We just wait for the session to resolve
 * then forward the user to the dashboard (or wherever they came from).
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Give the client time to exchange the code / parse the hash.
    // onAuthStateChange fires as soon as the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        subscription.unsubscribe()
        // Redirect to dashboard after successful sign-in
        const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard"
        router.replace(next)
      }
    })

    // Safety net: if no SIGNED_IN fires within 5s, send to sign-in page
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      router.replace("/auth/signin?error=timeout")
    }, 5000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [router])

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
    }}>
      {/* Spinner */}
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: "3px solid var(--border-mid)",
        borderTopColor: "var(--accent)",
        animation: "spin 0.7s linear infinite",
        marginBottom: 20,
      }} />
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Signing you in…</p>
    </div>
  )
}
