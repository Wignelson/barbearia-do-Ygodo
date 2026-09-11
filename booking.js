import { firebaseConfig } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ---- Configuração do funcionamento da barbearia ----
const HORA_ABERTURA = 10; // 10h
const HORA_FECHAMENTO = 21; // 21h
const DURACAO_MINUTOS = 30; // duração de cada atendimento

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const calendarEl = document.getElementById("calendar");
const slotsSection = document.getElementById("slots-section");
const slotsGrid = document.getElementById("slots-grid");
const selectedDateLabel = document.getElementById("selected-date-label");
const formSection = document.getElementById("form-section");
const bookingForm = document.getElementById("booking-form");
const selectedSlotLabel = document.getElementById("selected-slot-label");
const feedbackEl = document.getElementById("feedback");
const successSection = document.getElementById("success-section");

let blockedDates = new Set();
let selectedDateKey = null;
let selectedSlot = null;

function gerarHorarios() {
  const horarios = [];
  let minutosTotais = HORA_ABERTURA * 60;
  const fimTotal = HORA_FECHAMENTO * 60;
  while (minutosTotais + DURACAO_MINUTOS <= fimTotal) {
    const h = String(Math.floor(minutosTotais / 60)).padStart(2, "0");
    const m = String(minutosTotais % 60).padStart(2, "0");
    horarios.push(`${h}:${m}`);
    minutosTotais += DURACAO_MINUTOS;
  }
  return horarios;
}

const TODOS_HORARIOS = gerarHorarios();

function formatarDataExtenso(key) {
  const [ano, mes, dia] = key.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
}

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
    selectedSlot = null;
    formSection.hidden = true;
    successSection.hidden = true;
    selectedDateLabel.textContent = formatarDataExtenso(dateKey);
    slotsSection.hidden = false;
    carregarHorarios(dateKey);
  }
});

async function carregarHorarios(dateKey) {
  slotsGrid.innerHTML = "<p class='muted'>Carregando horários...</p>";
  const snap = await get(ref(db, `appointments/${dateKey}`));
  const ocupados = snap.exists() ? snap.val() : {};

  slotsGrid.innerHTML = "";
  const agora = new Date();
  const ehHoje = dateKey === toKey(agora);

  TODOS_HORARIOS.forEach((horario) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = horario;

    const ocupado = Boolean(ocupados[horario]);

    // Se for hoje, não deixa marcar um horário que já passou
    let jaPassou = false;
    if (ehHoje) {
      const [h, m] = horario.split(":").map(Number);
      const horarioSlot = new Date();
      horarioSlot.setHours(h, m, 0, 0);
      jaPassou = horarioSlot <= agora;
    }

    if (ocupado || jaPassou) {
      btn.disabled = true;
      btn.classList.add("is-disabled");
    } else {
      btn.addEventListener("click", () => {
        selectedSlot = horario;
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
}

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedbackEl.textContent = "";

  if (!selectedDateKey || !selectedSlot) {
    feedbackEl.textContent = "Escolha uma data e um horário antes de confirmar.";
    return;
  }

  const nome = bookingForm.nome.value.trim();
  const telefone = bookingForm.telefone.value.trim();
  const servico = bookingForm.servico.value;

  if (!nome || !telefone || !servico) {
    feedbackEl.textContent = "Preencha todos os campos.";
    return;
  }

  const submitBtn = bookingForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Agendando...";

  const slotRef = ref(db, `appointments/${selectedDateKey}/${selectedSlot}`);

  try {
    const resultado = await runTransaction(slotRef, (atual) => {
      if (atual) {
        // já foi ocupado por outra pessoa entre o carregamento e o envio
        return; // aborta a transação, não sobrescreve
      }
      return {
        nome,
        telefone,
        servico,
        criadoEm: Date.now()
      };
    });

    if (!resultado.committed) {
      feedbackEl.textContent =
        "Ih, esse horário acabou de ser reservado por outra pessoa. Escolha outro.";
      carregarHorarios(selectedDateKey);
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirmar agendamento";
      return;
    }

    formSection.hidden = true;
    slotsSection.hidden = true;
    successSection.hidden = false;
    successSection.querySelector(".success__details").textContent =
      `${formatarDataExtenso(selectedDateKey)} às ${selectedSlot}`;
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
  formSection.hidden = true;
});
