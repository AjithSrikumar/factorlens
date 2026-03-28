/**
 * Supabase admin client for server-side API routes.
 * Uses the SERVICE_ROLE_KEY which bypasses RLS — never expose to client.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'

export const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Returns true only if both env vars are properly set */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here'
  )
}
