import { firebaseConfig, ADMIN_PASSWORD } from "./firebase-config.js";
import { createCalendar, toKey } from "./calendar.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const loginSection = document.getElementById("login-section");
const painelSection = document.getElementById("painel-section");
const loginForm = document.getElementById("login-form");
const loginErro = document.getElementById("login-erro");

const calendarEl = document.getElementById("admin-calendar");
const dataSelecionadaLabel = document.getElementById("admin-data-label");
const bloquearBtn = document.getElementById("bloquear-dia");
const statusDiaLabel = document.getElementById("status-dia");
const listaAgendamentos = document.getElementById("lista-agendamentos");

let blockedDates = new Set();
let dataSelecionada = null;

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

// ---- Login simples (trava de tela, ver aviso em firebase-config.js) ----
if (sessionStorage.getItem("barbearia_admin_ok") === "1") {
  entrarNoPainel();
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const senha = loginForm.senha.value;
  if (senha === ADMIN_PASSWORD) {
    sessionStorage.setItem("barbearia_admin_ok", "1");
    entrarNoPainel();
  } else {
    loginErro.textContent = "Senha incorreta.";
    loginForm.senha.value = "";
  }
});

function entrarNoPainel() {
  loginSection.hidden = true;
  painelSection.hidden = false;
  iniciarPainel();
}

let calendar;
function iniciarPainel() {
  onValue(ref(db, "blockedDates"), (snap) => {
    const val = snap.val() || {};
    blockedDates = new Set(Object.keys(val).filter((k) => val[k]));
    if (calendar) calendar.refreshBlockedDates(blockedDates);
    if (dataSelecionada) atualizarStatusDia(dataSelecionada);
  });

  calendar = createCalendar(calendarEl, {
    blockedDates,
    onSelect: (dateKey) => {
      dataSelecionada = dateKey;
      dataSelecionadaLabel.textContent = formatarDataExtenso(dateKey);
      document.getElementById("dia-detalhe").hidden = false;
      atualizarStatusDia(dateKey);
      carregarAgendamentosDoDia(dateKey);
    }
  });
}

// No painel do admin, dias bloqueados também podem ser selecionados
// (o cliente não pode clicar neles, mas o barbeiro precisa poder
// clicar para desbloquear) — então criamos um clique alternativo
// direto na grade depois que ela renderiza.
calendarEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".calendar__day.is-blocked");
  if (!btn) return;
  // Descobre a data pelo texto do botão + mês/ano visível no título
  const tituloEl = calendarEl.querySelector(".calendar__title");
  if (!tituloEl) return;
  const [nomeMes, ano] = tituloEl.textContent.split(" ");
  const MESES = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  const mesIndex = MESES.indexOf(nomeMes);
  const dia = Number(btn.textContent);
  const data = new Date(Number(ano), mesIndex, dia);
  const key = toKey(data);
  dataSelecionada = key;
  dataSelecionadaLabel.textContent = formatarDataExtenso(key);
  document.getElementById("dia-detalhe").hidden = false;
  atualizarStatusDia(key);
  carregarAgendamentosDoDia(key);
});

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

async function carregarAgendamentosDoDia(dateKey) {
  listaAgendamentos.innerHTML = "<p class='muted'>Carregando...</p>";
  const snap = await get(ref(db, `appointments/${dateKey}`));
  const dados = snap.exists() ? snap.val() : {};
  const horarios = Object.keys(dados).sort();

  if (horarios.length === 0) {
    listaAgendamentos.innerHTML = "<p class='muted'>Nenhum agendamento para este dia.</p>";
    return;
  }

  listaAgendamentos.innerHTML = "";
  horarios.forEach((horario) => {
    const item = dados[horario];
    const card = document.createElement("div");
    card.className = "agendamento-card";
    card.innerHTML = `
      <div class="agendamento-card__hora">${horario}</div>
      <div class="agendamento-card__info">
        <strong>${item.nome}</strong>
        <span>${item.telefone}</span>
        <span>${item.servico}</span>
      </div>
    `;
    const cancelarBtn = document.createElement("button");
    cancelarBtn.type = "button";
    cancelarBtn.className = "agendamento-card__cancelar";
    cancelarBtn.textContent = "Cancelar";
    cancelarBtn.addEventListener("click", async () => {
      if (!confirm(`Cancelar o horário de ${item.nome} às ${horario}?`)) return;
      await remove(ref(db, `appointments/${dateKey}/${horario}`));
      carregarAgendamentosDoDia(dateKey);
    });
    card.appendChild(cancelarBtn);
    listaAgendamentos.appendChild(card);
  });
}
