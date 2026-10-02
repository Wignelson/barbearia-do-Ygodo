# Barbearia do Ygodo

Site de agendamento feito com HTML, CSS, JavaScript e Firebase Realtime Database.
Os arquivos ficam todos nesta pasta; não há subpastas `js/` ou `css/`.

## Configurar o Firebase

1. No [Firebase Console](https://console.firebase.google.com/), abra o projeto configurado em `firebase-config.js`.
2. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
3. Em **Authentication → Users**, crie o usuário do barbeiro usando o e-mail definido como `ADMIN_EMAIL` em `firebase-config.js`. A tela do painel pede só a senha; ela é validada pelo Firebase e não fica salva no código.
4. Confirme se o Realtime Database está criado e se `firebase-config.js` contém a configuração web desse projeto.
5. Para testar, use regras temporárias apenas em ambiente de desenvolvimento. Não publique o banco em modo de teste.

O painel agora usa Firebase Authentication, mas as regras do Realtime Database também precisam exigir autenticação para alterações administrativas. A autenticação da tela, sozinha, não protege o banco.

### Atenção antes de publicar

O agendamento público precisa consultar a disponibilidade e gravar reservas sem que o cliente entre com uma conta. No modelo atual, os dados de agendamento e os dados pessoais do cliente ficam no mesmo caminho do banco usado para essa consulta. Regras que liberem leitura e escrita públicas nesse caminho podem expor nomes e telefones e permitir alterações indevidas.

Não use regras públicas de leitura/escrita em produção. Para publicar com segurança, a próxima etapa é mover a criação de reservas para um backend (por exemplo, uma Cloud Function), separar os dados públicos de disponibilidade dos dados privados dos clientes e configurar regras que permitam somente as operações necessárias. Até essa etapa, use o projeto apenas para desenvolvimento/testes.

## Executar localmente

Como o site usa módulos JavaScript, abra-o por um servidor HTTP local, não com duplo clique no `index.html`. Na pasta do projeto, execute:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. O painel fica em `http://localhost:8000/admin.html`.

## Arquivos principais

- `index.html`: página pública de agendamento.
- `admin.html`: painel do barbeiro.
- `booking.js`: calendário, horários e formulário do cliente.
- `admin.js`: login, durações e controles administrativos.
- `schedule.js`: reserva atômica dos blocos de horário por dia.
- `calendar.js`: calendário compartilhado pelas páginas.
- `firebase-config.js`: configuração pública do app Firebase. Não coloque senhas ou chaves privadas neste arquivo.
- `style.css`: estilos do site.

## Funcionamento

- O calendário não permite escolher datas passadas.
- O cliente escolhe data, serviço, horário e informa nome e telefone.
- Os horários ocupados são gravados numa transação por dia para rejeitar reservas concorrentes no mesmo bloco.
- O barbeiro pode fechar dias, bloquear horários, definir horários especiais, cadastrar/editar/remover serviços e definir a duração padrão de cada serviço.
- No painel, também pode ajustar a duração de um atendimento específico. A grade reserva ou libera blocos de 30 minutos, impede sobreposições e atualiza em tempo real o relógio público quando um atendimento muda.
- O login do painel usa Firebase Authentication.

### Notificações por WhatsApp

O site ainda precisa ser conectado a um provedor oficial de WhatsApp e a um backend para enviar confirmações e lembretes automaticamente. Não coloque tokens do WhatsApp no JavaScript público. O lembrete no dia do atendimento também precisa de uma tarefa agendada no backend.

O app é de uma barbearia/cadeira. As durações, horários padrão e regras de funcionamento estão nos arquivos JavaScript.
