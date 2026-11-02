import { createClient } from "jsr:@supabase/supabase-js@2";
import { roadmap } from '../_shared/handlers.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((request) => roadmap(request, Deno.env.toObject(), db));
