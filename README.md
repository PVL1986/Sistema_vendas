# 🚀 Sistema de Vendas e Comissões - DRP Soluções

Sistema web completo para gestão comercial de representantes, focado no controlo de pedidos, clientes, produtos, fornecedores (representadas), fluxo financeiro de parcelas/comissões e despesas operacionais.

---

## 📋 Principais Funcionalidades

- **🏭 Gestão de Fornecedores / Representadas:** Cadastro completo com consulta automática de CNPJ via API, endereço e gestão de logótipos personalizados.
- **👥 Carteira de Clientes:** Registo de clientes, limites de crédito, geolocalização e histórico detalhado de compras por cliente.
- **📦 Controlo de Produtos:** Gestão de catálogo, códigos NCM, preços e baixa automática de stock a cada pedido emitido.
- **📝 Emissão e Espelho de Pedidos:** Carrinho dinâmico com cálculo de IPI, ST, descontos, frete, condições de pagamento e geração de espelho para impressão em PDF ou envio direto via WhatsApp e E-mail.
- **💰 Fluxo Financeiro e Comissões:** Controlo de parcelas (vencidas, a vencer e quitadas), repasses e relatórios de acerto.
- **💸 Despesas Operacionais e Lucro Líquido:** Registo de custos diários da operação para apuração do lucro líquido mensal.
- **📊 Dashboard Interativo:** Gráficos dinâmicos com o Top 5 produtos, clientes, evolução do faturamento (via Chart.js) e acompanhamento de metas comerciais mensais.
- **👥 Gestão de Utilizadores e Níveis de Acesso:** Controlo de administradores, gestores e vendedores auxiliares com liberação específica por representada.

---

## 🛠️ Tecnologias Utilizadas

Este projeto foi desenvolvido com tecnologias modernas focadas em alta performance e facilidade de manutenção (sem necessidade de servidores complexos no back-end):

- **Front-end:** HTML5, CSS3, JavaScript (ES6+)
- **Estilização e Gráficos:** Design responsivo personalizado e [Chart.js](https://www.chartjs.org/) para visualização de dados.
- **Base de Dados e Autenticação:** Firebase (Authentication & Cloud Firestore)
- **APIs Externas:** Integração com BrasilAPI e ViaCEP para preenchimento automático de cadastros.

---

## ⚙️ Como Executar o Projeto Localmente

Como a aplicação utiliza o Firebase diretamente via CDN, é muito simples executá-la:

1. Clone o repositório para a sua máquina:
   ```bash
   git clone [https://github.com/PVL1986/NOME-DO-REPOSITORIO.git](https://github.com/PVL1986/NOME-DO-REPOSITORIO.git)
