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

console.log('URL:', url);
console.log('KEY:', key ? 'FOUND' : 'MISSING');

const supabase = createClient(url, key);

async function check() {
  try {
    const { data: users, error: uErr } = await supabase.from('users').select('id, name, email, role, team_ids, status');
    if (uErr) throw uErr;
    console.log('--- USERS ---');
    console.log(JSON.stringify(users, null, 2));

    const { data: approvals, error: aErr } = await supabase.from('approve_tasks').select('*');
    if (aErr) throw aErr;
    console.log('--- APPROVE_TASKS ---');
    console.log(JSON.stringify(approvals, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
