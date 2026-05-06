import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lrbxbgrghrhapixxousy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYnhiZ3JnaHJoYXBpeHhvdXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDEwMjIsImV4cCI6MjA5MzYxNzAyMn0.C3engayNvizHCo1lUaEv16fHiSZ56io1RUmWeVthzIk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
