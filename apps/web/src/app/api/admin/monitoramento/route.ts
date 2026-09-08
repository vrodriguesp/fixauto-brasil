import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const ACCESS_LOG = '/var/log/nginx/fixauto-access.log';
const SERVER_ERROR_LOG = '/root/.pm2/logs/fixauto-brasil-error.log';

// Matches the default Nginx "combined" log format:
// IP - user [time_local] "METHOD path HTTP/1.1" status bytes "referer" "user-agent"
const LOG_LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\d+)/;

function parseAccessLog() {
  let lines: string[] = [];
  try {
    lines = execSync(`tail -n 20000 "${ACCESS_LOG}"`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return { porDia: [], topPaginas: [], statusCodes: {}, ipsUnicos: 0, totalRequisicoes: 0 };
  }

  const porDia: Record<string, number> = {};
  const porPagina: Record<string, number> = {};
  const statusCodes: Record<string, number> = {};
  const ips = new Set<string>();

  for (const line of lines) {
    const m = line.match(LOG_LINE);
    if (!m) continue;
    const [, ip, timeLocal, , path, status] = m;

    // time_local looks like "07/Sep/2026:17:37:50 +0000" -> use the date part
    const dia = timeLocal.split(':')[0];
    porDia[dia] = (porDia[dia] || 0) + 1;

    if (!path.startsWith('/_next/') && !path.startsWith('/api/log-error')) {
      porPagina[path] = (porPagina[path] || 0) + 1;
    }

    const classe = `${status[0]}xx`;
    statusCodes[classe] = (statusCodes[classe] || 0) + 1;

    ips.add(ip);
  }

  const porDiaArr = Object.entries(porDia)
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(-7);

  const topPaginas = Object.entries(porPagina)
    .map(([path, total]) => ({ path, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return { porDia: porDiaArr, topPaginas, statusCodes, ipsUnicos: ips.size, totalRequisicoes: lines.length };
}

function readServerErrors() {
  try {
    const raw = execSync(`tail -n 300 "${SERVER_ERROR_LOG}"`, { encoding: 'utf8' });
    return raw
      .split('\n')
      .filter((l) => l.trim() && !l.includes('Using the user object as returned from'))
      .slice(-40)
      .reverse();
  } catch {
    return [];
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const [{ data: clientErrors }, acessos] = await Promise.all([
      supabaseAdmin
        .from('app_errors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
      Promise.resolve(parseAccessLog()),
    ]);

    const serverErrors = readServerErrors();

    return NextResponse.json({
      acessos,
      clientErrors: clientErrors || [],
      serverErrors,
    });
  } catch (error) {
    console.error('[admin/monitoramento]', error);
    return NextResponse.json({ error: 'Erro ao carregar monitoramento' }, { status: 500 });
  }
}
