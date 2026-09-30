import { firebaseConfig } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { reservarHorarios } from "./schedule.js";

// ---- Configuração padrão do funcionamento da barbearia ----
const HORA_ABERTURA = 10; // 10h
const HORA_FECHAMENTO = 21; // 21h
const TAMANHO_GRADE_MINUTOS = 30; // granularidade da grade de horários

// Duração padrão de cada serviço, em minutos (o barbeiro pode
// sobrescrever isso no painel dele, em "Duração de cada serviço")
const DURACOES_PADRAO = {
  "Corte": 30,
  "Barba": 30,
  "Corte + Barba": 45,
  "Sobrancelha": 15
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const calendarEl = document.getElementById("calendar");
const servicoSection = document.getElementById("servico-section");
const servicoSelect = document.getElementById("servico-select");
const slotsSection = document.getElementById("slots-section");
const slotsGrid = document.getElementById("slots-grid");
const selectedDateLabel = document.getElementById("selected-date-label");
const selectedServicoLabel = document.getElementById("selected-servico-label");
const formSection = document.getElementById("form-section");
const bookingForm = document.getElementById("booking-form");
const selectedSlotLabel = document.getElementById("selected-slot-label");
const feedbackEl = document.getElementById("feedback");
const successSection = document.getElementById("success-section");

let blockedDates = new Set();
let duracoesServicos = { ...DURACOES_PADRAO };
let selectedDateKey = null;
let selectedServico = null;
let selectedSlot = null;
let selectedHorariosList = [];
let horariosDoDiaAtual = [];

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

function formatarDataExtenso(key) {
  const [ano, mes, dia] = key.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
}

// Carrega as durações configuradas pelo barbeiro (ou usa o padrão)
get(ref(db, "serviceDurations")).then((snap) => {
  if (snap.exists()) {
    duracoesServicos = { ...DURACOES_PADRAO, ...snap.val() };
  }
});

// Escuta em tempo real os dias fechados pelo barbeiro
onValue(ref(db, "blockedDates"), (snap) => {
  const val = snap.val() || {};
  blockedDates = new Set(Object.keys(val).filter((k) => val[k]));
  calendar.refreshBlockedDates(blockedDates);
});

const calendar = createCalendar(calendarEl, {
  blockedDates,
  onSelect: (dateKey) => {
    selectedDateKey = dateKey;
    selectedServico = null;
    selectedSlot = null;
    selectedHorariosList = [];
    servicoSelect.value = "";
    slotsSection.hidden = true;
    formSection.hidden = true;
    successSection.hidden = true;
    selectedDateLabel.textContent = formatarDataExtenso(dateKey);
    servicoSection.hidden = false;
  }
});

servicoSelect.addEventListener("change", () => {
  selectedServico = servicoSelect.value;
  if (!selectedServico || !selectedDateKey) return;
  selectedSlot = null;
  selectedHorariosList = [];
  formSection.hidden = true;
  successSection.hidden = true;
  selectedServicoLabel.textContent = selectedServico;
  slotsSection.hidden = false;
  carregarHorarios(selectedDateKey, selectedServico);
});

async function carregarHorarios(dateKey, servico) {
  slotsGrid.innerHTML = "<p class='muted'>Carregando horários...</p>";

  const duracaoMinutos = duracoesServicos[servico] || 30;
  const unidadesNecessarias = Math.max(1, Math.ceil(duracaoMinutos / TAMANHO_GRADE_MINUTOS));

  const [customSnap, agendamentosSnap, bloqueadosSnap] = await Promise.all([
    get(ref(db, `customHours/${dateKey}`)),
    get(ref(db, `appointments/${dateKey}`)),
    get(ref(db, `blockedSlots/${dateKey}`))
  ]);

  let inicio = HORA_ABERTURA * 60;
  let fim = HORA_FECHAMENTO * 60;
  if (customSnap.exists()) {
    const custom = customSnap.val();
    inicio = paraMinutos(custom.abertura);
    fim = paraMinutos(custom.fechamento);
  }

  const horariosDoDia = gerarGradeHorarios(inicio, fim);
  horariosDoDiaAtual = horariosDoDia;
  const ocupados = agendamentosSnap.exists() ? agendamentosSnap.val() : {};
  const bloqueados = bloqueadosSnap.exists() ? bloqueadosSnap.val() : {};

  slotsGrid.innerHTML = "";

  if (horariosDoDia.length === 0) {
    slotsGrid.innerHTML = "<p class='muted'>Nenhum horário disponível neste dia.</p>";
    return;
  }

  const agora = new Date();
  const ehHoje = dateKey === toKey(agora);
  let algumDisponivel = false;

  horariosDoDia.forEach((horario, indice) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = horario;

    // verifica se há espaço consecutivo suficiente a partir daqui,
    // e se o horário de término real cabe antes do fechamento
    let cabeAqui =
      indice + unidadesNecessarias <= horariosDoDia.length &&
      paraMinutos(horario) + duracaoMinutos <= fim;
    const janela = [];
    if (cabeAqui) {
      for (let i = 0; i < unidadesNecessarias; i++) {
        const h = horariosDoDia[indice + i];
        janela.push(h);
        if (ocupados[h] || bloqueados[h]) {
          cabeAqui = false;
        }
      }
    }

    let jaPassou = false;
    if (ehHoje) {
      const [h, m] = horario.split(":").map(Number);
      const horarioSlot = new Date();
      horarioSlot.setHours(h, m, 0, 0);
      jaPassou = horarioSlot <= agora;
    }

    if (!cabeAqui || jaPassou) {
      btn.disabled = true;
      btn.classList.add("is-disabled");
    } else {
      algumDisponivel = true;
      btn.addEventListener("click", () => {
        selectedSlot = horario;
        selectedHorariosList = janela;
        document
          .querySelectorAll(".slot.is-selected")
          .forEach((el) => el.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        selectedSlotLabel.textContent = horario;
        formSection.hidden = false;
        successSection.hidden = true;
        formSection.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    slotsGrid.appendChild(btn);
  });

  if (!algumDisponivel) {
    const aviso = document.createElement("p");
    aviso.className = "muted";
    aviso.textContent = `Não há espaço de ${duracaoMinutos} min disponível neste dia para este serviço.`;
    slotsGrid.appendChild(aviso);
  }
}

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedbackEl.textContent = "";

  if (!selectedDateKey || !selectedServico || !selectedSlot || selectedHorariosList.length === 0) {
    feedbackEl.textContent = "Escolha o serviço, a data e o horário antes de confirmar.";
    return;
  }

  const nome = bookingForm.nome.value.trim();
  const telefone = bookingForm.telefone.value.trim();

  if (!nome || !telefone) {
    feedbackEl.textContent = "Preencha todos os campos.";
    return;
  }

  const submitBtn = bookingForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Agendando...";

  try {
    const resultado = await reservarHorarios(db, selectedDateKey, selectedSlot, selectedHorariosList, {
      nome,
      telefone,
      servico: selectedServico,
      duracaoMinutos: duracoesServicos[selectedServico] || 30,
      criadoEm: Date.now()
    });

    if (!resultado.reservado) {
      feedbackEl.textContent = resultado.motivo === "dia-fechado"
        ? "O barbeiro fechou este dia. Escolha outra data."
        : resultado.motivo === "bloqueado"
          ? "Esse horário foi bloqueado pelo barbeiro. Escolha outro."
          : "Ih, algum desses horários acabou de ser reservado por outra pessoa. Escolha outro.";
      await carregarHorarios(selectedDateKey, selectedServico);
      formSection.hidden = true;
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirmar agendamento";
      return;
    }

    formSection.hidden = true;
    slotsSection.hidden = true;
    servicoSection.hidden = true;
    successSection.hidden = false;
    successSection.querySelector(".success__details").textContent =
      `${selectedServico} — ${formatarDataExtenso(selectedDateKey)} às ${selectedSlot}`;
    bookingForm.reset();
  } catch (err) {
    console.error(err);
    feedbackEl.textContent =
      "Não deu pra agendar agora. Verifique sua conexão e tente de novo.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar agendamento";
  }
});

document.getElementById("novo-agendamento")?.addEventListener("click", () => {
  successSection.hidden = true;
  slotsSection.hidden = true;
  servicoSection.hidden = true;
  formSection.hidden = true;
});
