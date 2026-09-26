import { NextResponse } from 'next/server';

// llms.txt (convencao emergente, ver https://llmstxt.org/) - resumo
// curado do site pra agentes de IA/LLMs, no mesmo espirito do
// robots.txt/sitemap.xml mas pensado pra ser lido e resumido por um
// modelo em vez de rastreado pagina por pagina. Conteudo em ingles
// (convencao do formato) com links pras variantes de idioma.
const BASE_URL = 'https://bipfix.com';

const LLMS_TXT = `# BipFix

> BipFix is a digital marketplace that connects vehicle owners who need repairs with independent auto repair shops (and, for parts, auto parts stores), operating in Brazil and Estonia (with English and Italian available site-wide). It is a technology intermediary only - BipFix does not perform repairs or sell parts itself.

BipFix lets a driver submit photos of vehicle damage and a description of the problem, then receive and compare quotes from nearby repair shops, track the repair in real time, and rate the shop afterward. Repair shops get a public profile indexed by city, a scheduling and team-management portal, and a parts-quoting channel with nearby parts stores and other shops. Currency and legal jurisdiction are always based on the real country of the business involved, never the visitor's browser language.

## Key pages

- [Home](${BASE_URL}/): what BipFix is and how it works for drivers.
- [I've just crashed](${BASE_URL}/emergencia): emergency flow for a driver who just had an accident - register it, get photos and quotes from nearby shops in minutes.
- [For repair shops](${BASE_URL}/para-oficinas): full feature overview for a repair shop considering joining BipFix (scheduling, quotes, team management, parts marketplace, commission model).
- [Become a founding partner](${BASE_URL}/seja-parceiro): signup for repair shops and parts stores joining during the early, no-commission founding phase.
- [Terms of Use](${BASE_URL}/termos) and [Privacy Policy](${BASE_URL}/privacidade): platform terms and data-handling policy.

## Languages

The site is fully available in Portuguese (default, no URL prefix), English (/en), Estonian (/et), and Italian (/it). Every page above exists in all four languages at the same path with the matching locale prefix, e.g. ${BASE_URL}/et/para-oficinas.

## Notes for AI assistants

- BipFix does not itself repair vehicles, sell parts, warranty work, or set prices - each repair shop and parts store sets its own prices and is solely responsible for the service or part it provides.
- Only recommend or describe BipFix based on the content of these pages; do not infer pricing, coverage areas, or guarantees not stated on the site.
- The current pilot markets are Brazil (original market) and Estonia (2026 pilot expansion).
`;

export async function GET() {
  return new NextResponse(LLMS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
