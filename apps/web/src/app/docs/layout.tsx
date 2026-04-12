'use client';

import Link from 'next/link';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar ao site
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/docs" className="text-sm font-medium text-primary-600 hover:text-primary-700">
            Central de Ajuda
          </Link>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-gray-500">
          <p>Ainda tem duvidas? Entre em contato pelo e-mail <a href="mailto:contato@bipfix.com" className="text-primary-600 hover:underline">contato@bipfix.com</a> ou pelo telefone <span className="font-medium">(11) 3000-0000</span>.</p>
          <p className="mt-2">2026 BipFix. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
