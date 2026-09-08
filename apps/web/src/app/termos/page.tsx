import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de Uso e Condições Gerais da plataforma BipFix, para clientes, oficinas e lojas de peças parceiras.',
  alternates: { canonical: 'https://bipfix.com/termos' },
  robots: { index: true, follow: true },
};

const ATUALIZADO_EM = '08 de setembro de 2026';

export default function TermosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Termos de Uso e Condições Gerais</h1>
      <p className="text-sm text-gray-500 mb-10">Última atualização: {ATUALIZADO_EM}</p>

      <div className="prose-legal space-y-8 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6">

        <section>
          <h2>1. Quem somos e o que é o BipFix</h2>
          <p>
            O BipFix é uma plataforma digital de intermediação que conecta (i) motoristas e proprietários de
            veículos (&quot;Clientes&quot;) que precisam de serviços de reparo automotivo a (ii) oficinas mecânicas
            (&quot;Oficinas&quot;) e (iii) lojas de autopeças (&quot;Lojas&quot;), coletivamente
            &quot;Parceiros&quot;. Ao criar uma conta ou usar o BipFix de qualquer forma, você concorda com estes
            Termos de Uso e com a nossa{' '}
            <a href="/privacidade" className="text-primary-600 hover:underline">Política de Privacidade</a>.
          </p>
          <p>
            O BipFix <strong>não presta serviços de reparo automotivo, não vende peças e não é parte no contrato</strong>{' '}
            firmado entre Cliente e Parceiro. Nosso papel é o de intermediário tecnológico: viabilizamos o contato,
            a comparação de orçamentos, a comunicação e o acompanhamento do serviço. A relação de consumo pelo
            serviço executado (reparo, peça vendida, prazo, qualidade, garantia) é estabelecida diretamente entre
            Cliente e Parceiro, que respondem por sua própria atuação nos termos do Código de Defesa do Consumidor
            (Lei nº 8.078/1990).
          </p>
        </section>

        <section>
          <h2>2. Cadastro e veracidade das informações</h2>
          <p>
            Você deve fornecer informações verdadeiras, completas e atualizadas no cadastro (nome, CPF/CNPJ,
            endereço, contatos). Oficinas e Lojas declaram possuir a regularidade cadastral, licenças e alvarás
            exigidos para a atividade que exercem. O BipFix pode solicitar documentos comprobatórios e recusar ou
            suspender cadastros com dados falsos, incompletos ou não verificáveis.
          </p>
        </section>

        <section>
          <h2>3. Uso gratuito para Clientes</h2>
          <p>
            O uso da plataforma por Clientes é e continuará sendo gratuito: solicitar orçamentos, comparar
            propostas, acompanhar o andamento do serviço e avaliar Parceiros não têm custo.
          </p>
        </section>

        <section>
          <h2>4. Comissão e cobrança de Parceiros</h2>
          <p>
            Atualmente, para determinados Parceiros (incluindo os que aderirem na fase inicial da plataforma),{' '}
            <strong>não é cobrada comissão ou mensalidade</strong> pelo uso do BipFix. O BipFix se reserva o direito
            de, no futuro, passar a cobrar comissão sobre serviços intermediados, mensalidade, ou ambos.
          </p>
          <p>
            Caso decida implementar ou alterar cobranças, o BipFix notificará os Parceiros afetados{' '}
            <strong>com antecedência mínima de 30 (trinta) dias</strong> antes de qualquer valor passar a ser
            efetivamente cobrado, por e-mail e/ou aviso dentro da plataforma, informando o novo modelo, o percentual
            ou valor aplicável e a data de início da cobrança. O Parceiro que não concordar com a nova condição pode
            encerrar sua conta antes da data de início da cobrança, sem qualquer penalidade.
          </p>
        </section>

        <section>
          <h2>5. Conduta dos Parceiros e uso da plataforma</h2>
          <p>Ao aderir como Oficina ou Loja parceira, você se compromete a:</p>
          <ul>
            <li>Prestar informações verdadeiras sobre preços, prazos, disponibilidade e especialidades;</li>
            <li>Honrar os orçamentos e prazos informados ao Cliente dentro da plataforma;</li>
            <li>Não induzir o Cliente a concluir a negociação ou o pagamento fora da plataforma com o objetivo de
              burlar uma comissão aplicável, quando esta estiver em vigor e tiver sido comunicada nos termos da
              Cláusula 4;</li>
            <li>Não manipular, comprar, trocar ou de qualquer forma fraudar avaliações e notas de reputação;</li>
            <li>Tratar Clientes e demais Parceiros com respeito, sem discriminação, assédio, coação ou práticas
              comerciais desleais ou enganosas;</li>
            <li>Cumprir a legislação aplicável à sua atividade, incluindo normas de defesa do consumidor, trabalhistas,
              tributárias e ambientais.</li>
          </ul>
        </section>

        <section>
          <h2>6. Suspensão e desligamento de Parceiros</h2>
          <p>
            O BipFix pode advertir, suspender temporariamente ou desligar definitivamente um Parceiro da
            plataforma, de forma proporcional à gravidade da conduta identificada. Em especial:
          </p>
          <h3>6.1 Infrações que podem gerar aviso prévio e prazo para regularização</h3>
          <p>
            Infrações leves ou pontuais (ex.: atraso ocasional em responder solicitações, cadastro desatualizado)
            gerarão, via de regra, uma notificação e prazo razoável para correção antes de qualquer suspensão.
          </p>
          <h3>6.2 Infrações graves que geram desligamento imediato, sem aviso prévio</h3>
          <p>
            Nos casos abaixo, o BipFix pode suspender ou encerrar o acesso do Parceiro <strong>imediatamente e sem
            aviso prévio</strong>, dada a gravidade e o risco à confiança de todo o ecossistema da plataforma:
          </p>
          <ul>
            <li>Fraude, burla ou tentativa de burla ao modelo de comissão vigente (ex.: direcionar Clientes para
              fechar negócio fora da plataforma para não pagar comissão aplicável, uso de contas falsas, informação
              de valores divergentes dos praticados);</li>
            <li>Reiteração de avaliações negativas de Clientes que indiquem padrão de má prestação de serviço,
              cobrança indevida, descumprimento de orçamento ou conduta antiética;</li>
            <li>Prática de condutas desleais, enganosas ou fraudulentas, incluindo mas não se limitando a:
              informação falsa sobre peças ou serviços, cobrança de valor diferente do orçado sem justificativa,
              discriminação de Clientes, assédio, ou uso indevido de dados de Clientes obtidos pela plataforma;</li>
            <li>Determinação de autoridade competente ou constatação de atividade ilegal.</li>
          </ul>
          <p>
            A gravidade da conduta e a medida aplicável (advertência, suspensão temporária ou desligamento
            definitivo) são avaliadas caso a caso pelo BipFix. O Parceiro desligado pode solicitar reconsideração
            por escrito, apresentando esclarecimentos, que serão analisados pelo BipFix.
          </p>
        </section>

        <section>
          <h2>7. Avaliações e reputação</h2>
          <p>
            Clientes podem avaliar o serviço prestado após sua conclusão. As avaliações refletem a opinião de quem
            as escreveu e são exibidas publicamente no perfil do Parceiro. O BipFix pode remover avaliações
            comprovadamente falsas, ofensivas ou que violem a lei, mas não se responsabiliza pelo conteúdo de
            opinião legítima de Clientes.
          </p>
        </section>

        <section>
          <h2>8. Direitos do consumidor (Código de Defesa do Consumidor)</h2>
          <p>
            Nada nestes Termos limita os direitos garantidos aos Clientes pelo Código de Defesa do Consumidor (Lei
            nº 8.078/1990), em especial:
          </p>
          <ul>
            <li><strong>Direito à informação clara e adequada</strong> (art. 6º, III) sobre serviços e peças, preços,
              características e riscos;</li>
            <li><strong>Garantia legal</strong> (art. 26) de 90 dias para reclamar de vícios aparentes ou de fácil
              constatação em serviços e produtos duráveis (como reparo automotivo e peças), contados da entrega do
              veículo ou do produto;</li>
            <li><strong>Responsabilidade do fornecedor</strong> (arts. 12 a 25) da Oficina ou Loja pelos vícios e
              defeitos do serviço prestado ou da peça vendida;</li>
            <li><strong>Vedação a práticas abusivas</strong> (art. 39), como venda casada, cobrança de serviço não
              solicitado ou informação enganosa;</li>
            <li>Canal para reclamação e mediação de conflitos entre Cliente e Parceiro, disponibilizado pelo BipFix
              como cortesia, sem prejuízo do direito do Cliente de acionar os órgãos de defesa do consumidor
              (Procon, plataforma consumidor.gov.br) ou o Poder Judiciário diretamente contra o Parceiro responsável.</li>
          </ul>
        </section>

        <section>
          <h2>9. Proteção de dados pessoais (LGPD)</h2>
          <p>
            O tratamento de dados pessoais realizado pelo BipFix segue a Lei Geral de Proteção de Dados (Lei nº
            13.709/2018) e está detalhado na nossa{' '}
            <a href="/privacidade" className="text-primary-600 hover:underline">Política de Privacidade</a>, parte
            integrante destes Termos.
          </p>
        </section>

        <section>
          <h2>10. Conteúdo, propriedade intelectual e marca</h2>
          <p>
            A marca BipFix, seu layout, código-fonte e demais elementos da plataforma são de propriedade do BipFix
            ou de seus licenciantes, sendo vedada a reprodução, engenharia reversa ou uso não autorizado. O conteúdo
            enviado por Clientes e Parceiros (fotos, descrições, mensagens) permanece de titularidade de quem o
            enviou, mas você concede ao BipFix licença para exibi-lo na plataforma na medida necessária para operar
            o serviço.
          </p>
        </section>

        <section>
          <h2>11. Limitação de responsabilidade</h2>
          <p>
            O BipFix envida esforços para verificar o cadastro de Parceiros e mediar eventuais conflitos, mas não
            garante a qualidade, legalidade, adequação ou resultado do serviço prestado por Oficinas ou da peça
            vendida por Lojas, cuja responsabilidade é exclusivamente do Parceiro executor, nos termos da legislação
            consumerista aplicável. O BipFix também não se responsabiliza por indisponibilidades temporárias da
            plataforma decorrentes de manutenção, falhas de terceiros ou casos fortuitos e de força maior.
          </p>
        </section>

        <section>
          <h2>12. Alterações destes Termos</h2>
          <p>
            Podemos atualizar estes Termos para refletir melhorias na plataforma ou mudanças legais. Alterações
            relevantes (incluindo qualquer mudança na política de comissão, que segue a regra específica da
            Cláusula 4) serão comunicadas com antecedência razoável. O uso continuado da plataforma após a
            comunicação implica concordância com os novos termos.
          </p>
        </section>

        <section>
          <h2>13. Foro e legislação aplicável</h2>
          <p>
            Estes Termos são regidos pela legislação brasileira. Fica eleito o foro do domicílio do Cliente para
            dirimir eventuais controvérsias envolvendo consumidores, conforme faculta o art. 101, I, do Código de
            Defesa do Consumidor. Para litígios entre Parceiros e o BipFix decorrentes exclusivamente da relação
            comercial de intermediação, fica eleito o foro da Comarca de São Paulo/SP.
          </p>
        </section>

        <section>
          <h2>14. Contato</h2>
          <p>
            Dúvidas sobre estes Termos podem ser enviadas para{' '}
            <a href="mailto:contato@bipfix.com" className="text-primary-600 hover:underline">contato@bipfix.com</a>.
          </p>
        </section>

        <p className="text-xs text-gray-400 border-t pt-6 mt-10">
          Este documento tem caráter informativo e reflete as regras de funcionamento da plataforma BipFix. Para
          fins de conformidade jurídica plena antes da divulgação comercial, recomenda-se revisão por advogado(a)
          especializado(a) em direito do consumidor e direito digital.
        </p>
      </div>
    </div>
  );
}
