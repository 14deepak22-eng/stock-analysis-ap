import { createClient } from "@supabase/supabase-js";

// This client is safe to use in both the browser and the server for
// reading data. The anon key only allows what your Supabase row-level
// security policies permit.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
