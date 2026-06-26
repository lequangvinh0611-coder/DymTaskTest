import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

let url = process.env.VITE_SUPABASE_URL || '';
if (url.endsWith('/rest/v1/')) {
  url = url.replace('/rest/v1/', '');
} else if (url.endsWith('/rest/v1')) {
  url = url.replace('/rest/v1', '');
}
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
  try {
    const { data, error } = await supabase.rpc('get_publication_tables');
    // If rpc doesn't exist, we can try querying using a standard query or check if there's an error.
    console.log('Result:', data, 'Error:', error);
  } catch (err) {
    console.error(err);
  }
}

check();
