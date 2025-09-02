import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// Helpful runtime guard so you don't get the vague "supabaseUrl is required"
if (!url) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
if (!anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_KEY');

export const supabase = createClient(url, anonKey);