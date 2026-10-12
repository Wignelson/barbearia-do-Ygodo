import { firebaseConfig } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SLOT_MINUTES = 30;
const OPEN_DEFAULT = "10:00";
const CLOSE_DEFAULT = "21:00";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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
let servicos = {};
let selectedDateKey = null;
let selectedServico = null;
let selectedSlot = null;
let refreshTimer = null;
let availabilityRequest = 0;
let stopBookedListener = null;
let stopBlockedListener = null;

function formatarDataExtenso(key) {
  const [ano, mes, dia] = key.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long"
  });
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function paraHHMM(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function gerarGradeHorarios(inicio, fim) {
  const horarios = [];
  for (let minuto = inicio; minuto < fim; minuto += SLOT_MINUTES) horarios.push(paraHHMM(minuto));
  return horarios;
}

function renderizarServicos() {
  servicoSelect.replaceChildren(Object.assign(document.createElement("option"), {
    value: "", textContent: "Selecione", disabled: true, selected: true
  }));
  Object.entries(servicos).forEach(([id, servico]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = servico.nome;
    servicoSelect.appendChild(option);
  });
  servicoSelect.disabled = Object.keys(servicos).length === 0;
}

function mostrarErroDeCarregamento() {
  slotsGrid.replaceChildren();
  const aviso = document.createElement("p");
  aviso.className = "muted";
  aviso.textContent = "Não foi possível carregar os horários agora. Atualize a página ou tente novamente mais tarde.";
  slotsGrid.appendChild(aviso);
}

async function garantirAcessoAnonimo() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

async function carregarConfiguracaoPublica() {
  try {
    await garantirAcessoAnonimo();
    const [servicesSnap, blockedSnap] = await Promise.all([
      get(ref(db, "services")),
      get(ref(db, "blockedDates"))
    ]);
    servicos = servicesSnap.val() || {
      corte: { nome: "Corte", duracaoMinutos: 30 },
      barba: { nome: "Barba", duracaoMinutos: 30 },
      corte_barba: { nome: "Corte + Barba", duracaoMinutos: 45 },
      sobrancelha: { nome: "Sobrancelha", duracaoMinutos: 15 }
    };
    const fechados = blockedSnap.val() || {};
    blockedDates = new Set(Object.keys(fechados).filter((key) => fechados[key] === true));
    calendar.refreshBlockedDates(blockedDates);
    renderizarServicos();
  } catch (error) {
    console.error(error);
    servicoSelect.disabled = true;
    const aviso = document.createElement("p");
    aviso.className = "feedback";
    aviso.setAttribute("role", "alert");
    aviso.textContent = "Não foi possível conectar ao sistema de agendamento. Tente novamente mais tarde.";
    servicoSection.appendChild(aviso);
  }
}

const calendar = createCalendar(calendarEl, {
  blockedDates,
  onSelect: (dateKey) => {
    stopBookedListener?.();
    stopBlockedListener?.();
    stopBookedListener = null;
    stopBlockedListener = null;
    selectedDateKey = dateKey;
    selectedServico = null;
    selectedSlot = null;
    servicoSelect.value = "";
    slotsSection.hidden = true;
    formSection.hidden = true;
    successSection.hidden = true;
    selectedDateLabel.textContent = formatarDataExtenso(dateKey);
    servicoSection.hidden = false;
    if (refreshTimer) clearInterval(refreshTimer);
  }
});

servicoSelect.addEventListener("change", () => {
  selectedServico = servicoSelect.value;
  if (!selectedServico || !selectedDateKey) return;
  selectedSlot = null;
  formSection.hidden = true;
  successSection.hidden = true;
  feedbackEl.textContent = "";
  selectedServicoLabel.textContent = servicos[selectedServico]?.nome || selectedServico;
  slotsSection.hidden = false;
  carregarHorarios();
  stopBookedListener?.();
  stopBlockedListener?.();
  let primeiraLeituraOcupados = true;
  let primeiraLeituraBloqueados = true;
  stopBookedListener = onValue(ref(db, `bookedSlots/${selectedDateKey}`), () => {
    if (primeiraLeituraOcupados) { primeiraLeituraOcupados = false; return; }
    if (selectedDateKey && selectedServico) carregarHorarios();
  });
  stopBlockedListener = onValue(ref(db, `blockedSlots/${selectedDateKey}`), () => {
    if (primeiraLeituraBloqueados) { primeiraLeituraBloqueados = false; return; }
    if (selectedDateKey && selectedServico) carregarHorarios();
  });
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (selectedDateKey && selectedServico && formSection.hidden && successSection.hidden) carregarHorarios();
  }, 20000);
});

async function obterDisponibilidade(dateKey, serviceId) {
  const [hoursSnap, bookedSnap, blockedSnap, closedSnap] = await Promise.all([
    get(ref(db, `customHours/${dateKey}`)),
    get(ref(db, `bookedSlots/${dateKey}`)),
    get(ref(db, `blockedSlots/${dateKey}`)),
    get(ref(db, `blockedDates/${dateKey}`))
  ]);
  const hours = hoursSnap.val() || {};
  const openAt = paraMinutos(hours.abertura || OPEN_DEFAULT);
  const closeAt = paraMinutos(hours.fechamento || CLOSE_DEFAULT);
  const service = servicos[serviceId];
  const duration = Number(service?.duracaoMinutos || 30);
  const times = gerarGradeHorarios(openAt, closeAt);
  const booked = bookedSnap.val() || {};
  const blocked = blockedSnap.val() || {};
  const now = new Date();
  const ehHoje = dateKey === toKey(now);
  const requiredSlots = Math.max(1, Math.ceil(duration / SLOT_MINUTES));
  const slots = times.map((time, index) => {
    const window = times.slice(index, index + requiredSlots);
    let available = closedSnap.val() !== true
      && window.length === requiredSlots
      && paraMinutos(time) + duration <= closeAt
      && !window.some((slot) => booked[slot] === true || blocked[slot] === true);
    if (ehHoje) {
      const [hour, minute] = time.split(":").map(Number);
      const start = new Date();
      start.setHours(hour, minute, 0, 0);
      if (start <= now) available = false;
    }
    return { time, available };
  });
  return { closed: closedSnap.val() === true, duration, slots };
}

async function carregarHorarios() {
  if (!selectedDateKey || !selectedServico) return;
  const requestId = ++availabilityRequest;
  slotsGrid.innerHTML = "<p class='muted'>Carregando horários...</p>";
  try {
    const data = await obterDisponibilidade(selectedDateKey, selectedServico);
    if (requestId !== availabilityRequest) return;
    slotsGrid.replaceChildren();
    if (data.closed) {
      const aviso = document.createElement("p");
      aviso.className = "muted";
      aviso.textContent = "O barbeiro fechou este dia. Escolha outra data.";
      slotsGrid.appendChild(aviso);
      return;
    }
    let algumDisponivel = false;
    data.slots.forEach(({ time, available }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = time;
      if (!available) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
      } else {
        algumDisponivel = true;
        btn.addEventListener("click", () => {
          selectedSlot = time;
          document.querySelectorAll(".slot.is-selected").forEach((el) => el.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          selectedSlotLabel.textContent = time;
          feedbackEl.textContent = "";
          formSection.hidden = false;
          successSection.hidden = true;
          if (refreshTimer) clearInterval(refreshTimer);
          formSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      slotsGrid.appendChild(btn);
    });
    if (!algumDisponivel) {
      const aviso = document.createElement("p");
      aviso.className = "muted";
      aviso.textContent = `Não há espaço de ${data.duration} min disponível neste dia para este serviço.`;
      slotsGrid.appendChild(aviso);
    }
  } catch (error) {
    console.error(error);
    if (requestId === availabilityRequest) mostrarErroDeCarregamento();
  }
}

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedbackEl.textContent = "";
  if (!selectedDateKey || !selectedServico || !selectedSlot) {
    feedbackEl.textContent = "Escolha o serviço, a data e o horário antes de confirmar.";
    return;
  }
  const nome = bookingForm.nome.value.trim();
  const telefone = bookingForm.telefone.value.trim();
  if (nome.length < 2 || telefone.replace(/\D/g, "").length < 8) {
    feedbackEl.textContent = "Informe um nome e telefone válidos.";
    return;
  }
  const submitBtn = bookingForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Agendando...";
  try {
    await garantirAcessoAnonimo();
    const data = await obterDisponibilidade(selectedDateKey, selectedServico);
    const chosen = data.slots.find((slot) => slot.time === selectedSlot);
    if (!chosen?.available) throw new Error("slot-occupied");
    const service = servicos[selectedServico];
    const duration = Number(service?.duracaoMinutos || 30);
    const window = gerarGradeHorarios(
      paraMinutos(data.slots[0]?.time || OPEN_DEFAULT),
      paraMinutos(data.slots[data.slots.length - 1]?.time || CLOSE_DEFAULT) + SLOT_MINUTES
    );
    const startIndex = window.indexOf(selectedSlot);
    const count = Math.max(1, Math.ceil(duration / SLOT_MINUTES));
    const occupiedTimes = window.slice(startIndex, startIndex + count);
    if (startIndex < 0 || occupiedTimes.length !== count) throw new Error("slot-occupied");

    const writes = {};
    writes[`appointments/${selectedDateKey}/${selectedSlot}`] = {
      nome: nome.slice(0, 100),
      telefone: telefone.slice(0, 30),
      servico: service.nome,
      servicoId: selectedServico,
      duracaoMinutos: duration,
      criadoEm: Date.now(),
      horarios: occupiedTimes
    };
    occupiedTimes.forEach((time, index) => {
      writes[`bookedSlots/${selectedDateKey}/${time}`] = true;
      if (index > 0) writes[`appointments/${selectedDateKey}/${time}`] = { principal: selectedSlot };
    });
    await update(ref(db), writes);

    formSection.hidden = true;
    slotsSection.hidden = true;
    servicoSection.hidden = true;
    successSection.hidden = false;
    successSection.querySelector(".success__details").textContent =
      `${service.nome} — ${formatarDataExtenso(selectedDateKey)} às ${selectedSlot}`;
    bookingForm.reset();
  } catch (error) {
    console.error(error);
    const conflito = error.message === "slot-occupied" || error.code === "PERMISSION_DENIED" || error.code === "database/permission-denied";
    feedbackEl.textContent = conflito
      ? "Esse horário acabou de ser reservado. Escolha outro."
      : "Não foi possível concluir o agendamento. Confira a conexão e tente novamente.";
    selectedSlot = null;
    selectedSlotLabel.textContent = "Escolha outro horário";
    await carregarHorarios();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar agendamento";
  }
});

document.getElementById("novo-agendamento")?.addEventListener("click", () => {
  stopBookedListener?.();
  stopBlockedListener?.();
  stopBookedListener = null;
  stopBlockedListener = null;
  successSection.hidden = true;
  slotsSection.hidden = true;
  servicoSection.hidden = true;
  formSection.hidden = true;
  selectedSlot = null;
  servicoSelect.value = "";
  if (refreshTimer) clearInterval(refreshTimer);
});

carregarConfiguracaoPublica();
