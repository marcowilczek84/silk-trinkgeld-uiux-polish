import { createClient } from '@supabase/supabase-js';

window.SilkSupabase = {
  create() {
    const config = window.SILK_SUPABASE_CONFIG || {};
    if (!config.url || !config.publishableKey) return null;
    return createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }
};
