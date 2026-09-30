import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { reservarHorarios } from "./schedule.js";
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

let blockedDates = new Set();
let duracoesServicos = { ...DURACOES_PADRAO };
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
  const snap = await get(ref(db, "serviceDurations"));
  if (snap.exists()) {
    duracoesServicos = { ...DURACOES_PADRAO, ...snap.val() };
  }
  renderizarDuracoes();
}

function renderizarDuracoes() {
  duracoesGrid.innerHTML = "";
  Object.keys(DURACOES_PADRAO).forEach((servico) => {
    const campo = document.createElement("div");
    campo.className = "form__campo";
    const id = `duracao-${servico.replace(/\s+/g, "-").toLowerCase()}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = `${servico} (minutos)`;
    const input = document.createElement("input");
    input.type = "number";
    input.id = id;
    input.min = "15";
    input.step = "5";
    input.value = String(duracoesServicos[servico] || DURACOES_PADRAO[servico]);
    campo.append(label, input);
    campo.dataset.servico = servico;
    duracoesGrid.appendChild(campo);
  });
}

salvarDuracoesBtn.addEventListener("click", async () => {
  const atualizacoes = {};
  duracoesGrid.querySelectorAll(".form__campo").forEach((campo) => {
    const servico = campo.dataset.servico;
    const input = campo.querySelector("input");
    const valor = Number(input.value);
    if (valor > 0) {
      atualizacoes[servico] = valor;
    }
  });
  await set(ref(db, "serviceDurations"), atualizacoes);
  duracoesServicos = { ...DURACOES_PADRAO, ...atualizacoes };
  duracoesFeedback.textContent = "Durações salvas!";
  setTimeout(() => (duracoesFeedback.textContent = ""), 2500);
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
  const servico = adminBookingForm.servico.value;

  if (!nome || !telefone || !servico) {
    adminFeedback.textContent = "Preencha todos os campos.";
    return;
  }

  const duracaoMinutos = duracoesServicos[servico] || 30;
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
    servico,
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
