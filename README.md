# Site de Agendamento — Barbearia

Site estático (HTML + CSS + JavaScript puro) para o cliente agendar horário
online e o barbeiro gerenciar a agenda. Os agendamentos ficam salvos no
**Firebase Realtime Database** (gratuito), então funcionam em tempo real em
qualquer aparelho — celular, computador, notebook.

## Estrutura

```
barbearia/
├── index.html        → página do cliente (agendar horário)
├── admin.html         → painel do barbeiro (ver e cancelar horários, fechar dias)
├── css/style.css       → visual do site
└── js/
    ├── firebase-config.js  → suas chaves do Firebase (precisa editar)
    ├── calendar.js         → calendário reutilizável
    ├── booking.js          → lógica da página do cliente
    └── admin.js            → lógica do painel do barbeiro
```

## 1. Configurar o Firebase (gratuito)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
   e crie um projeto novo.
2. No menu lateral, vá em **Compilação → Realtime Database** e clique em
   **Criar banco de dados**. Escolha a localização e inicie em **modo de
   teste** (depois ajustamos as regras).
3. Vá em **Configurações do projeto** (ícone de engrenagem) → aba **Geral**
   → em "Seus apps", clique no ícone `</>` para registrar um app Web.
4. Copie o objeto `firebaseConfig` que aparece e cole em
   `js/firebase-config.js`, substituindo os valores de exemplo.
5. Ainda em `firebase-config.js`, troque `ADMIN_PASSWORD` por uma senha sua.
   Isso é só uma trava simples de tela para o painel do barbeiro — não é uma
   autenticação real (veja o aviso de segurança abaixo).

### Regras do Realtime Database (importante)

O "modo de teste" do Firebase libera leitura/escrita para qualquer pessoa por
30 dias e depois bloqueia tudo. Antes de divulgar o site, vá em **Realtime
Database → Regras** e use algo como:

```json
{
  "rules": {
    "appointments": {
      ".read": true,
      ".write": true
    },
    "blockedDates": {
      ".read": true,
      ".write": true
    }
  }
}
```

Isso mantém o site funcionando (qualquer cliente precisa conseguir escrever
um novo agendamento sem login). Para uma segurança melhor no futuro, o ideal
é migrar o login do painel do barbeiro para o **Firebase Authentication** e
restringir `".write"` de `blockedDates`/cancelamentos só a usuários
autenticados — a senha simples que está no código hoje é fácil de contornar
por alguém que abrir o código-fonte da página.

## 2. Testar localmente

Como o projeto usa `type="module"`, o navegador não abre `index.html`
direto do disco (`file://`) sem erro de CORS. Rode um servidor local simples:

```bash
# dentro da pasta barbearia/
python3 -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador.

## 3. Publicar no GitHub Pages

1. Suba a pasta `barbearia/` (ou o conteúdo dela) para o seu repositório no
   GitHub.
2. No repositório, vá em **Settings → Pages**.
3. Em "Source", selecione a branch (ex: `main`) e a pasta (`/root` ou `/docs`,
   dependendo de onde os arquivos ficaram).
4. Salve. Em alguns minutos o site estará disponível em
   `https://seu-usuario.github.io/nome-do-repositorio/`.

## O que já está pronto

- Calendário mostra só a partir do dia de hoje (nunca deixa escolher data
  passada), e o mês anterior ao atual fica bloqueado na navegação.
- Horário de funcionamento: segunda a domingo, 10h às 21h, em blocos de
  30 minutos (ajustável em `booking.js`, constantes `HORA_ABERTURA`,
  `HORA_FECHAMENTO` e `DURACAO_MINUTOS`).
- Se o dia selecionado for hoje, horários que já passaram somem da lista.
- O barbeiro pode fechar/reabrir um dia específico pelo painel — esse dia
  fica indisponível para o cliente automaticamente.
- Dois agendamentos não conseguem "brigar" pelo mesmo horário: a escrita usa
  uma transação no Firebase que rejeita o segundo envio se alguém já tiver
  ocupado o horário nos últimos segundos.
- Layout responsivo (celular, tablet, notebook).

## Ideias para evoluir depois

- Trocar a senha simples do painel por Firebase Authentication.
- Enviar confirmação por WhatsApp (ex: API do Twilio ou link `wa.me`).
- Permitir mais de um barbeiro/cadeira (hoje o projeto assume só 1).
- Adicionar campo de observações no agendamento.
