# Barbearia do Ygodo

Site de agendamento feito com HTML, CSS, JavaScript e Firebase Realtime Database.
Os arquivos ficam todos nesta pasta; não há subpastas `js/` ou `css/`.

## Configurar o Firebase

1. No [Firebase Console](https://console.firebase.google.com/), abra o projeto configurado em `firebase-config.js`.
2. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
3. Em **Authentication → Users**, crie o usuário do barbeiro usando o e-mail definido como `ADMIN_EMAIL` em `firebase-config.js`. A tela do painel pede só a senha; ela é validada pelo Firebase e não fica salva no código.
4. Confirme se o Realtime Database está criado e se `firebase-config.js` contém a configuração web desse projeto.
5. Em **Authentication → Sign-in method**, habilite também **Anônimo** para que clientes possam agendar sem criar uma conta.
6. As regras do Realtime Database estão em `database.rules.json`. A página pública lê apenas serviços, horários e marcações de disponibilidade; nomes e telefones ficam em `appointments`, acessível somente ao barbeiro.

### Atenção antes de publicar

Não publique regras que liberem leitura do banco inteiro. Antes de abrir o site atualizado, entre no painel do barbeiro uma vez para sincronizar os agendamentos existentes com a lista pública de horários ocupados. Só publique `database.rules.json` depois de confirmar que a página pública usa `bookedSlots` e que o painel está autenticado.

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
- `database.rules.json`: regras que permitem consultar apenas dados operacionais e mantêm os dados pessoais restritos ao barbeiro.
- `admin.js`: login, durações e controles administrativos.
- `schedule.js`: reserva atômica dos blocos de horário por dia.
- `calendar.js`: calendário compartilhado pelas páginas.
- `firebase-config.js`: configuração pública do app Firebase. Não coloque senhas ou chaves privadas neste arquivo.
- `style.css`: estilos do site.

## Funcionamento

- O calendário não permite escolher datas passadas.
- O cliente entra anonimamente, escolhe data, serviço e horário e informa nome e telefone.
- A página pública lê somente `bookedSlots`, que contém horários sem nomes ou telefones; os dados do agendamento ficam em `appointments`.
- A criação do agendamento e a marcação dos horários ocupados são enviadas juntas ao Realtime Database.
- O barbeiro pode fechar dias, bloquear horários, definir horários especiais, cadastrar/editar/remover serviços e definir a duração padrão de cada serviço.
- No painel, também pode ajustar a duração de um atendimento específico. A grade reserva ou libera blocos de 30 minutos, impede sobreposições e atualiza em tempo real o relógio público quando um atendimento muda.
- O login do painel usa Firebase Authentication.

### Notificações por WhatsApp

O site ainda precisa ser conectado a um provedor oficial de WhatsApp e a um backend para enviar confirmações e lembretes automaticamente. Não coloque tokens do WhatsApp no JavaScript público. O lembrete no dia do atendimento também precisa de uma tarefa agendada no backend.

### Notificações push para o barbeiro

O painel já tem a interface para ativar notificações. O envio push ainda precisa ser integrado às funções de reserva e configurado com chaves VAPID; não publique essa parte junto com a restauração do banco sem concluir essa configuração.

O app é de uma barbearia/cadeira. As durações, horários padrão e regras de funcionamento estão nos arquivos JavaScript.
