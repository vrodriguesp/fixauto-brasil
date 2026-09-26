import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o BipFix coleta, usa e protege dados pessoais de clientes, oficinas e lojas parceiras, em conformidade com a LGPD.',
  alternates: { canonical: 'https://bipfix.com/privacidade' },
  robots: { index: true, follow: true },
};

const ATUALIZADO_EM = '08 de setembro de 2026';

export default function PrivacidadePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidade</h1>
      <p className="text-sm text-gray-500 mb-10">Última atualização: {ATUALIZADO_EM}</p>

      <div className="space-y-8 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6">

        <section>
          <h2>1. Introdução</h2>
          <p>
            Esta Política de Privacidade descreve como o BipFix (&quot;nós&quot;) coleta, usa, compartilha e protege
            dados pessoais de Clientes, Oficinas e Lojas parceiras (&quot;você&quot;), em conformidade com a Lei
            Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com o Marco Civil da Internet (Lei nº
            12.965/2014).
          </p>
        </section>

        <section>
          <h2>2. Quais dados coletamos</h2>
          <ul>
            <li><strong>Dados de cadastro:</strong> nome, CPF/CNPJ, e-mail, telefone, endereço e, para
              Oficinas/Lojas, dados do estabelecimento e da equipe (funcionários);</li>
            <li><strong>Dados de localização:</strong> endereço e coordenadas geográficas, usados para aproximar
              Clientes de Parceiros próximos;</li>
            <li><strong>Dados do veículo:</strong> marca, modelo, ano, placa (quando informada) e fotos do dano
              relatado;</li>
            <li><strong>Dados de uso:</strong> orçamentos, mensagens trocadas na plataforma, avaliações, histórico de
              serviços e pedidos de peças;</li>
            <li><strong>Dados técnicos:</strong> endereço IP, identificadores de sessão e registros de acesso
              (logs), mantidos conforme exigido pelo Marco Civil da Internet;</li>
            <li><strong>Cookies e tecnologias similares:</strong> usados para manter sua sessão autenticada e para
              estatísticas de uso agregadas do site.</li>
          </ul>
        </section>

        <section>
          <h2>3. Para que usamos seus dados (finalidade e base legal)</h2>
          <ul>
            <li><strong>Execução do contrato/prestação do serviço</strong> (art. 7º, V, LGPD): criar sua conta,
              conectar Clientes a Parceiros, processar orçamentos e pedidos, viabilizar o chat e as notificações;</li>
            <li><strong>Cumprimento de obrigação legal</strong> (art. 7º, II): manutenção de registros fiscais e
              logs de acesso;</li>
            <li><strong>Legítimo interesse</strong> (art. 7º, IX): prevenção a fraude, melhoria da plataforma,
              segurança da informação, e comunicação sobre novidades do serviço que você já utiliza;</li>
            <li><strong>Consentimento</strong> (art. 7º, I): quando exigido, como para comunicações de marketing
              distintas do relacionamento já existente — você pode revogar a qualquer momento.</li>
          </ul>
        </section>

        <section>
          <h2>4. Com quem compartilhamos seus dados</h2>
          <p>
            Compartilhamos dados estritamente na medida necessária para o funcionamento da plataforma:
          </p>
          <ul>
            <li>Entre Cliente e Parceiro envolvidos em uma mesma solicitação de orçamento ou pedido, para viabilizar
              o atendimento (nome, contato, endereço quando aplicável, fotos do veículo);</li>
            <li>Com prestadores de infraestrutura técnica (hospedagem, banco de dados, envio de e-mail/WhatsApp
              transacional), sob obrigações contratuais de confidencialidade e segurança;</li>
            <li>Com autoridades públicas, quando exigido por lei, ordem judicial ou requisição regulatória.</li>
          </ul>
          <p>Não vendemos dados pessoais a terceiros para fins de publicidade.</p>
        </section>

        <section>
          <h2>5. Por quanto tempo guardamos seus dados</h2>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa e pelo prazo adicional necessário para cumprir
            obrigações legais, fiscais e regulatórias (por exemplo, registros de acesso a aplicações de internet
            são mantidos por, no mínimo, 6 meses, conforme o Marco Civil da Internet) ou para exercício regular de
            direitos em processos administrativos ou judiciais.
          </p>
        </section>

        <section>
          <h2>6. Seus direitos como titular de dados</h2>
          <p>Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:</p>
          <ul>
            <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a
              lei;</li>
            <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
            <li>Eliminação dos dados tratados com base no seu consentimento;</li>
            <li>Informação sobre com quem compartilhamos seus dados;</li>
            <li>Revogação do consentimento, quando aplicável.</li>
          </ul>
          <p>
            Para exercer qualquer desses direitos, entre em contato pelo e-mail{' '}
            <a href="mailto:privacidade@bipfix.com" className="text-primary-600 hover:underline">privacidade@bipfix.com</a>.
            Responderemos dentro do prazo legal aplicável.
          </p>
        </section>

        <section>
          <h2>7. Segurança da informação</h2>
          <p>
            Adotamos medidas técnicas e administrativas para proteger dados pessoais contra acessos não autorizados
            e situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão, incluindo
            controle de acesso por autenticação, isolamento de dados por conta (RLS a nível de banco de dados) e
            criptografia em trânsito.
          </p>
        </section>

        <section>
          <h2>8. Crianças e adolescentes</h2>
          <p>
            O BipFix não é direcionado a menores de 18 anos e não coleta intencionalmente dados de crianças e
            adolescentes.
          </p>
        </section>

        <section>
          <h2>9. Alterações desta Política</h2>
          <p>
            Podemos atualizar esta Política periodicamente. Alterações relevantes serão comunicadas por e-mail ou
            aviso na plataforma antes de entrarem em vigor.
          </p>
        </section>

        <section>
          <h2>10. Contato do Encarregado de Dados (DPO)</h2>
          <p>
            Para questões relacionadas à proteção de dados pessoais, contate:{' '}
            <a href="mailto:privacidade@bipfix.com" className="text-primary-600 hover:underline">privacidade@bipfix.com</a>.
          </p>
        </section>

        <p className="text-xs text-gray-400 border-t pt-6 mt-10">
          Este documento tem caráter informativo. Para fins de conformidade jurídica plena antes da divulgação
          comercial, recomenda-se revisão por advogado(a) especializado(a) em proteção de dados (LGPD).
        </p>
      </div>
    </div>
  );
}
