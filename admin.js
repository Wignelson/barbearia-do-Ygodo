import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { reservarHorarios, ajustarDuracaoAgendamento } from "./schedule.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const HORA_ABERTURA_PADRAO = 10;
const HORA_FECHAMENTO_PADRAO = 21;
const TAMANHO_GRADE_MINUTOS = 30;

const DURACOES_PADRAO = {
  "Corte": 30,
  "Barba": 30,
  "Corte + Barba": 45,
  "Sobrancelha": 15
};
const SERVICOS_PADRAO = {
  corte: { nome: "Corte", duracaoMinutos: 30 },
  barba: { nome: "Barba", duracaoMinutos: 30 },
  corte_barba: { nome: "Corte + Barba", duracaoMinutos: 45 },
  sobrancelha: { nome: "Sobrancelha", duracaoMinutos: 15 }
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const loginSection = document.getElementById("login-section");
const painelSection = document.getElementById("painel-section");
const loginForm = document.getElementById("login-form");
const loginErro = document.getElementById("login-erro");
const sairBtn = document.getElementById("sair-painel");

const duracoesGrid = document.getElementById("duracoes-grid");
const salvarDuracoesBtn = document.getElementById("salvar-duracoes");
const duracoesFeedback = document.getElementById("duracoes-feedback");

const calendarEl = document.getElementById("admin-calendar");
const dataSelecionadaLabel = document.getElementById("admin-data-label");
const bloquearBtn = document.getElementById("bloquear-dia");
const statusDiaLabel = document.getElementById("status-dia");
const listaAgendamentos = document.getElementById("lista-agendamentos");

const horarioPadraoLabel = document.getElementById("horario-padrao-label");
const inputAberturaPersonalizada = document.getElementById("hora-abertura-personalizada");
const inputFechamentoPersonalizada = document.getElementById("hora-fechamento-personalizada");
const salvarHorarioBtn = document.getElementById("salvar-horario-personalizado");
const usarPadraoBtn = document.getElementById("usar-horario-padrao");

const adminSlotsGrid = document.getElementById("admin-slots-grid");
const slotAcaoSection = document.getElementById("admin-slot-acao");
const slotSelecionadoLabel = document.getElementById("admin-slot-selecionado-label");
const slotLivreAcoes = document.getElementById("admin-slot-livre-acoes");
const slotOcupadoAcoes = document.getElementById("admin-slot-ocupado-acoes");
const slotBloqueadoAcoes = document.getElementById("admin-slot-bloqueado-acoes");
const bloquearHorarioBtn = document.getElementById("bloquear-horario");
const reabrirHorarioBtn = document.getElementById("admin-reabrir-horario");
const cancelarHorarioBtn = document.getElementById("admin-cancelar-horario");
const ocupadoInfo = document.getElementById("admin-slot-ocupado-info");
const adminBookingForm = document.getElementById("admin-booking-form");
const adminFeedback = document.getElementById("admin-feedback");
const duracaoClienteForm = document.getElementById("duracao-cliente-form");
const duracaoClienteFeedback = document.getElementById("duracao-cliente-feedback");

let blockedDates = new Set();
let duracoesServicos = { ...DURACOES_PADRAO };
let servicos = { ...SERVICOS_PADRAO };
let dataSelecionada = null;
let horarioSelecionado = null;
let agendamentosDoDia = {};
let bloqueadosDoDia = {};
let horariosDoDiaAtual = [];

function formatarDataExtenso(key) {
  const [ano, mes, dia] = key.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function paraHHMM(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function gerarGradeHorarios(minutoInicio, minutoFim) {
  const horarios = [];
  let atual = minutoInicio;
  while (atual < minutoFim) {
    horarios.push(paraHHMM(atual));
    atual += TAMANHO_GRADE_MINUTOS;
  }
  return horarios;
}

// Pega os dados completos de um agendamento a partir de qualquer
// horário que ele ocupe (seja o principal ou um horário "filho")
function obterAgendamentoCompleto(horario) {
  const item = agendamentosDoDia[horario];
  if (!item) return null;
  if (item.principal) {
    return { horarioPrincipal: item.principal, dados: agendamentosDoDia[item.principal] };
  }
  return { horarioPrincipal: horario, dados: item };
}

// O acesso administrativo é autenticado pelo Firebase, nunca por senha no código.
onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    if (painelSection.hidden) entrarNoPainel();
  } else {
    loginSection.hidden = false;
    painelSection.hidden = true;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.textContent = "";
  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, loginForm.senha.value);
  } catch (error) {
    console.error(error);
    loginErro.textContent = "Não foi possível entrar. Confira o e-mail e a senha e verifique se o acesso por e-mail/senha está habilitado no Firebase.";
    loginForm.senha.value = "";
  } finally {
    submitBtn.disabled = false;
  }
});

sairBtn.addEventListener("click", () => signOut(auth));

function entrarNoPainel() {
  loginSection.hidden = true;
  painelSection.hidden = false;
  iniciarPainel();
}

let calendar;
function iniciarPainel() {
  carregarDuracoes();

  onValue(ref(db, "blockedDates"), (snap) => {
    const val = snap.val() || {};
    blockedDates = new Set(Object.keys(val).filter((k) => val[k]));
    if (calendar) calendar.refreshBlockedDates(blockedDates);
    if (dataSelecionada) atualizarStatusDia(dataSelecionada);
  });

  calendar = createCalendar(calendarEl, {
    blockedDates,
    onSelect: (dateKey) => selecionarDia(dateKey)
  });
}

calendarEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".calendar__day.is-blocked");
  if (!btn) return;
  const tituloEl = calendarEl.querySelector(".calendar__title");
  if (!tituloEl) return;
  const [nomeMes, ano] = tituloEl.textContent.split(" ");
  const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const mesIndex = MESES.indexOf(nomeMes);
  const dia = Number(btn.textContent);
  const data = new Date(Number(ano), mesIndex, dia);
  selecionarDia(toKey(data));
});

// ---- Duração de cada serviço (configuração geral) ----
async function carregarDuracoes() {
  const [servicosSnap, duracoesSnap] = await Promise.all([
    get(ref(db, "services")), get(ref(db, "serviceDurations"))
  ]);
  const duracoesAntigas = duracoesSnap.val() || {};
  servicos = servicosSnap.exists() ? servicosSnap.val() : Object.fromEntries(
    Object.entries(SERVICOS_PADRAO).map(([id, item]) => [id, {
      ...item, duracaoMinutos: duracoesAntigas[item.nome] || item.duracaoMinutos
    }])
  );
  duracoesServicos = Object.fromEntries(Object.values(servicos).map((item) => [item.nome, item.duracaoMinutos]));
  renderizarDuracoes();
  renderizarServicosAgendamento();
}

function renderizarDuracoes() {
  duracoesGrid.innerHTML = "";
  Object.entries(servicos).forEach(([id, servico]) => {
    const campo = document.createElement("div");
    campo.className = "form__campo";
    const label = document.createElement("label");
    label.textContent = `${servico.nome} — duração padrão (minutos)`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "15";
    input.step = "5";
    input.value = String(servico.duracaoMinutos || 30);
    const nome = document.createElement("input");
    nome.type = "text";
    nome.value = servico.nome;
    nome.setAttribute("aria-label", "Nome do serviço");
    campo.append(label, nome, input);
    campo.dataset.servicoId = id;
    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "btn btn--secundario";
    remover.textContent = "Remover serviço";
    remover.addEventListener("click", async () => {
      if (Object.keys(servicos).length <= 1) {
        duracoesFeedback.textContent = "Mantenha pelo menos um serviço cadastrado.";
        return;
      }
      const novos = { ...servicos };
      delete novos[id];
      await set(ref(db, "services"), novos);
      servicos = novos;
      duracoesServicos = Object.fromEntries(Object.values(servicos).map((item) => [item.nome, item.duracaoMinutos]));
      renderizarDuracoes();
      renderizarServicosAgendamento();
      duracoesFeedback.textContent = "Serviço removido.";
    });
    campo.appendChild(remover);
    duracoesGrid.appendChild(campo);
  });
}

function renderizarServicosAgendamento() {
  const select = document.getElementById("admin-servico");
  if (!select) return;
  select.replaceChildren(Object.assign(document.createElement("option"), {
    value: "", textContent: "Selecione", disabled: true, selected: true
  }));
  Object.entries(servicos).forEach(([id, servico]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = servico.nome;
    select.appendChild(option);
  });
}

salvarDuracoesBtn.addEventListener("click", async () => {
  const atualizacoes = {};
  let invalido = false;
  duracoesGrid.querySelectorAll(".form__campo").forEach((campo) => {
    const id = campo.dataset.servicoId;
    const [nome, input] = campo.querySelectorAll("input");
    const valor = Number(input.value);
    const nomeServico = nome.value.trim();
    if (!nomeServico || !Number.isFinite(valor) || valor < 5) invalido = true;
    else atualizacoes[id] = { nome: nomeServico, duracaoMinutos: valor };
  });
  if (invalido) {
    duracoesFeedback.textContent = "Confira os nomes e informe durações de pelo menos 5 minutos.";
    return;
  }
  await set(ref(db, "services"), atualizacoes);
  servicos = atualizacoes;
  duracoesServicos = Object.fromEntries(Object.values(servicos).map((item) => [item.nome, item.duracaoMinutos]));
  renderizarDuracoes();
  renderizarServicosAgendamento();
  duracoesFeedback.textContent = "Serviços e durações padrão salvos!";
  setTimeout(() => (duracoesFeedback.textContent = ""), 2500);
});

document.getElementById("novo-servico-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = e.currentTarget.nome.value.trim();
  const duracaoMinutos = Number(e.currentTarget.duracao.value);
  if (!nome || !Number.isFinite(duracaoMinutos) || duracaoMinutos < 5) return;
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const prefixo = base || "servico";
  let id = prefixo;
  let sufixo = 2;
  while (servicos[id]) id = `${prefixo}_${sufixo++}`;
  servicos = { ...servicos, [id]: { nome, duracaoMinutos } };
  await set(ref(db, "services"), servicos);
  duracoesServicos[nome] = duracaoMinutos;
  renderizarDuracoes();
  renderizarServicosAgendamento();
  e.currentTarget.reset();
  duracoesFeedback.textContent = "Novo serviço adicionado.";
});

function selecionarDia(dateKey) {
  dataSelecionada = dateKey;
  dataSelecionadaLabel.textContent = formatarDataExtenso(dateKey);
  document.getElementById("dia-detalhe").hidden = false;
  slotAcaoSection.hidden = true;
  atualizarStatusDia(dateKey);
  carregarHorarioPersonalizado(dateKey);
  carregarGradeDoDia(dateKey);
}

function atualizarStatusDia(dateKey) {
  const fechado = blockedDates.has(dateKey);
  statusDiaLabel.textContent = fechado ? "Fechado" : "Aberto normalmente";
  statusDiaLabel.classList.toggle("is-fechado", fechado);
  bloquearBtn.textContent = fechado ? "Reabrir este dia" : "Fechar este dia";
}

bloquearBtn.addEventListener("click", async () => {
  if (!dataSelecionada) return;
  const fechado = blockedDates.has(dataSelecionada);
  bloquearBtn.disabled = true;
  try {
    if (fechado) {
      await remove(ref(db, `blockedDates/${dataSelecionada}`));
    } else {
      await set(ref(db, `blockedDates/${dataSelecionada}`), true);
    }
  } finally {
    bloquearBtn.disabled = false;
  }
});

// ---- Horário personalizado do dia ----
async function carregarHorarioPersonalizado(dateKey) {
  const snap = await get(ref(db, `customHours/${dateKey}`));
  if (snap.exists()) {
    const custom = snap.val();
    inputAberturaPersonalizada.value = custom.abertura;
    inputFechamentoPersonalizada.value = custom.fechamento;
    horarioPadraoLabel.textContent =
      `Este dia tem horário próprio. Padrão geral: ${HORA_ABERTURA_PADRAO}h às ${HORA_FECHAMENTO_PADRAO}h.`;
  } else {
    inputAberturaPersonalizada.value = paraHHMM(HORA_ABERTURA_PADRAO * 60);
    inputFechamentoPersonalizada.value = paraHHMM(HORA_FECHAMENTO_PADRAO * 60);
    horarioPadraoLabel.textContent =
      `Usando o horário padrão: ${HORA_ABERTURA_PADRAO}h às ${HORA_FECHAMENTO_PADRAO}h.`;
  }
}

salvarHorarioBtn.addEventListener("click", async () => {
  if (!dataSelecionada) return;
  const abertura = inputAberturaPersonalizada.value;
  const fechamento = inputFechamentoPersonalizada.value;
  if (!abertura || !fechamento) return;
  if (paraMinutos(fechamento) <= paraMinutos(abertura)) {
    alert("O horário de fechamento precisa ser depois do horário de abertura.");
    return;
  }
  await set(ref(db, `customHours/${dataSelecionada}`), { abertura, fechamento });
  await carregarHorarioPersonalizado(dataSelecionada);
  await carregarGradeDoDia(dataSelecionada);
});

usarPadraoBtn.addEventListener("click", async () => {
  if (!dataSelecionada) return;
  await remove(ref(db, `customHours/${dataSelecionada}`));
  await carregarHorarioPersonalizado(dataSelecionada);
  await carregarGradeDoDia(dataSelecionada);
});

// ---- Grade de horários do dia ----
async function carregarGradeDoDia(dateKey) {
  adminSlotsGrid.innerHTML = "<p class='muted'>Carregando...</p>";
  slotAcaoSection.hidden = true;

  const [customSnap, agendamentosSnap, bloqueadosSnap] = await Promise.all([
    get(ref(db, `customHours/${dateKey}`)),
    get(ref(db, `appointments/${dateKey}`)),
    get(ref(db, `blockedSlots/${dateKey}`))
  ]);

  let inicio = HORA_ABERTURA_PADRAO * 60;
  let fim = HORA_FECHAMENTO_PADRAO * 60;
  if (customSnap.exists()) {
    const custom = customSnap.val();
    inicio = paraMinutos(custom.abertura);
    fim = paraMinutos(custom.fechamento);
  }

  agendamentosDoDia = agendamentosSnap.exists() ? agendamentosSnap.val() : {};
  bloqueadosDoDia = bloqueadosSnap.exists() ? bloqueadosSnap.val() : {};

  const horarios = gerarGradeHorarios(inicio, fim);
  horariosDoDiaAtual = horarios;
  adminSlotsGrid.innerHTML = "";

  horarios.forEach((horario) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = horario;

    const ocupado = Boolean(agendamentosDoDia[horario]);
    const bloqueado = Boolean(bloqueadosDoDia[horario]);

    if (ocupado) {
      btn.classList.add("slot--ocupado");
      const completo = obterAgendamentoCompleto(horario);
      if (completo?.dados) {
        btn.title = `${completo.dados.nome} — ${completo.dados.servico}`;
      }
    } else if (bloqueado) {
      btn.classList.add("is-disabled");
      btn.title = "Bloqueado";
    }

    btn.addEventListener("click", () => selecionarHorario(horario, { ocupado, bloqueado }));
    adminSlotsGrid.appendChild(btn);
  });

  renderizarListaAgendamentos(dateKey);
}

function selecionarHorario(horario, { ocupado, bloqueado }) {
  horarioSelecionado = horario;
  slotAcaoSection.hidden = false;
  slotSelecionadoLabel.textContent = `Horário ${horario}`;
  adminFeedback.textContent = "";

  slotLivreAcoes.hidden = true;
  slotOcupadoAcoes.hidden = true;
  slotBloqueadoAcoes.hidden = true;

  if (ocupado) {
    const completo = obterAgendamentoCompleto(horario);
    if (completo?.dados) {
      const item = completo.dados;
      ocupadoInfo.textContent =
        `${item.nome} — ${item.telefone} — ${item.servico} (${item.duracaoMinutos || 30} min, começa às ${completo.horarioPrincipal})`;
      duracaoClienteForm.duracao.value = String(item.duracaoMinutos || 30);
      duracaoClienteFeedback.textContent = "";
    }
    slotOcupadoAcoes.hidden = false;
  } else if (bloqueado) {
    slotBloqueadoAcoes.hidden = false;
  } else {
    adminBookingForm.reset();
    slotLivreAcoes.hidden = false;
  }

  slotAcaoSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

bloquearHorarioBtn.addEventListener("click", async () => {
  if (!dataSelecionada || !horarioSelecionado) return;
  await set(ref(db, `blockedSlots/${dataSelecionada}/${horarioSelecionado}`), true);
  slotAcaoSection.hidden = true;
  carregarGradeDoDia(dataSelecionada);
});

reabrirHorarioBtn.addEventListener("click", async () => {
  if (!dataSelecionada || !horarioSelecionado) return;
  await remove(ref(db, `blockedSlots/${dataSelecionada}/${horarioSelecionado}`));
  slotAcaoSection.hidden = true;
  carregarGradeDoDia(dataSelecionada);
});

cancelarHorarioBtn.addEventListener("click", async () => {
  if (!dataSelecionada || !horarioSelecionado) return;
  const completo = obterAgendamentoCompleto(horarioSelecionado);
  if (!completo) return;
  if (!confirm(`Cancelar o horário de ${completo.dados.nome}?`)) return;

  const horariosParaRemover = completo.dados.horarios || [completo.horarioPrincipal];
  const remocoes = {};
  horariosParaRemover.forEach((h) => {
    remocoes[`appointments/${dataSelecionada}/${h}`] = null;
  });
  await update(ref(db), remocoes);

  slotAcaoSection.hidden = true;
  carregarGradeDoDia(dataSelecionada);
});

adminBookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dataSelecionada || !horarioSelecionado) return;

  const nome = adminBookingForm.nome.value.trim();
  const telefone = adminBookingForm.telefone.value.trim();
  const servicoId = adminBookingForm.servico.value;
  const servico = servicos[servicoId];

  if (!nome || !telefone || !servico) {
    adminFeedback.textContent = "Preencha todos os campos.";
    return;
  }

  const duracaoMinutos = servico.duracaoMinutos || 30;
  const unidadesNecessarias = Math.max(1, Math.ceil(duracaoMinutos / TAMANHO_GRADE_MINUTOS));
  const indiceInicial = horariosDoDiaAtual.indexOf(horarioSelecionado);

  if (indiceInicial === -1 || indiceInicial + unidadesNecessarias > horariosDoDiaAtual.length) {
    adminFeedback.textContent = "Não há espaço suficiente a partir deste horário para esse serviço.";
    return;
  }

  const janela = horariosDoDiaAtual.slice(indiceInicial, indiceInicial + unidadesNecessarias);
  const dados = {
    nome,
    telefone,
    servico: servico.nome,
    servicoId,
    duracaoMinutos,
    criadoEm: Date.now()
  };
  const resultado = await reservarHorarios(db, dataSelecionada, horarioSelecionado, janela, dados, { allowClosedDate: true });
  if (!resultado.reservado) {
    adminFeedback.textContent = resultado.motivo === "bloqueado"
      ? "Um dos horários foi bloqueado. Atualizei a grade; tente novamente."
      : "Um dos horários acabou de ser ocupado. Atualizei a grade; tente novamente.";
    await carregarGradeDoDia(dataSelecionada);
    return;
  }

  slotAcaoSection.hidden = true;
  carregarGradeDoDia(dataSelecionada);
});

duracaoClienteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dataSelecionada || !horarioSelecionado) return;
  const completo = obterAgendamentoCompleto(horarioSelecionado);
  if (!completo) return;
  const duracaoMinutos = Number(duracaoClienteForm.duracao.value);
  if (!Number.isFinite(duracaoMinutos) || duracaoMinutos < 5) {
    duracaoClienteFeedback.textContent = "Informe uma duração válida.";
    return;
  }
  const unidadesNecessarias = Math.max(1, Math.ceil(duracaoMinutos / TAMANHO_GRADE_MINUTOS));
  const indiceInicial = horariosDoDiaAtual.indexOf(completo.horarioPrincipal);
  if (indiceInicial < 0 || indiceInicial + unidadesNecessarias > horariosDoDiaAtual.length) {
    duracaoClienteFeedback.textContent = "A duração ultrapassa o horário de fechamento deste dia.";
    return;
  }
  const janela = horariosDoDiaAtual.slice(indiceInicial, indiceInicial + unidadesNecessarias);
  duracaoClienteForm.querySelector("button[type=submit]").disabled = true;
  try {
    const resultado = await ajustarDuracaoAgendamento(
      db, dataSelecionada, completo.horarioPrincipal, janela, duracaoMinutos
    );
    if (!resultado.atualizado) {
      duracaoClienteFeedback.textContent = mensagemFalhaDuracao(resultado.motivo);
      await carregarGradeDoDia(dataSelecionada);
      return;
    }
    await carregarGradeDoDia(dataSelecionada);
    selecionarHorario(completo.horarioPrincipal, { ocupado: true, bloqueado: false });
    duracaoClienteFeedback.textContent = "Duração deste cliente atualizada e horários ajustados.";
  } catch (error) {
    console.error(error);
    duracaoClienteFeedback.textContent = "Não foi possível atualizar agora. Tente novamente.";
  } finally {
    duracaoClienteForm.querySelector("button[type=submit]").disabled = false;
  }
});

// ---- Lista de agendamentos do dia (leitura rápida + cancelar) ----
function renderizarListaAgendamentos(dateKey) {
  const horariosPrincipais = Object.keys(agendamentosDoDia)
    .filter((h) => !agendamentosDoDia[h].principal)
    .sort();

  if (horariosPrincipais.length === 0) {
    listaAgendamentos.innerHTML = "<p class='muted'>Nenhum agendamento para este dia.</p>";
    return;
  }

  listaAgendamentos.innerHTML = "";
  horariosPrincipais.forEach((horario) => {
    const item = agendamentosDoDia[horario];
    const card = document.createElement("div");
    card.className = "agendamento-card";
    const hora = document.createElement("div");
    hora.className = "agendamento-card__hora";
    hora.textContent = horario;
    const info = document.createElement("div");
    info.className = "agendamento-card__info";
    const nome = document.createElement("strong");
    nome.textContent = item.nome || "Cliente";
    const telefone = document.createElement("span");
    telefone.textContent = item.telefone || "";
    const servico = document.createElement("span");
    servico.textContent = `${item.servico || "Serviço"} (${item.duracaoMinutos || 30} min)`;
    info.append(nome, telefone, servico);
    card.append(hora, info);
    const cancelarBtn = document.createElement("button");
    cancelarBtn.type = "button";
    cancelarBtn.className = "agendamento-card__cancelar";
    cancelarBtn.textContent = "Cancelar";
    cancelarBtn.addEventListener("click", async () => {
      if (!confirm(`Cancelar o horário de ${item.nome} às ${horario}?`)) return;
      const horariosParaRemover = item.horarios || [horario];
      const remocoes = {};
      horariosParaRemover.forEach((h) => {
        remocoes[`appointments/${dateKey}/${h}`] = null;
      });
      await update(ref(db), remocoes);
      carregarGradeDoDia(dateKey);
    });
    card.appendChild(cancelarBtn);
    listaAgendamentos.appendChild(card);
  });
}

function mensagemFalhaDuracao(motivo) {
  if (motivo === "bloqueado") {
    return "O horário adicional está bloqueado. Reabra esse horário antes de aumentar a duração.";
  }
  if (motivo?.startsWith("ocupado:")) {
    const horario = motivo.slice("ocupado:".length);
    return `Não foi salvo: ${horario} já está reservado para outro atendimento. Ajuste a duração ou resolva a reserva seguinte.`;
  }
  if (motivo === "nao-encontrado") {
    return "Não encontrei esse agendamento no banco de horários. Atualize o painel e tente novamente.";
  }
  return "Não foi possível salvar a duração. Atualize o painel e tente novamente.";
}
