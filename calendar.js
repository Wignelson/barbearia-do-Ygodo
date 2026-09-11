// ============================================================
// CALENDÁRIO — mostra sempre a partir do dia de hoje em diante.
// Nunca renderiza nem deixa navegar para meses/dias no passado.
// ============================================================

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Cria um calendário interativo dentro de `container`.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {Set<string>} options.blockedDates - chaves "YYYY-MM-DD" fechadas pelo barbeiro
 * @param {(dateKey: string) => void} options.onSelect - chamado ao clicar num dia válido
 * @param {string} [options.selectedKey] - dia atualmente selecionado
 */
export function createCalendar(container, { blockedDates = new Set(), onSelect, selectedKey } = {}) {
  const today = startOfDay(new Date());
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let currentSelectedKey = selectedKey || null;

  function isPast(date) {
    return startOfDay(date) < today;
  }

  function isSameMonthAsToday() {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth();
  }

  function render() {
    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "calendar";

    // Cabeçalho: mês/ano + navegação (não deixa voltar antes do mês atual)
    const header = document.createElement("div");
    header.className = "calendar__header";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "calendar__nav";
    prevBtn.setAttribute("aria-label", "Mês anterior");
    prevBtn.textContent = "‹";
    prevBtn.disabled = isSameMonthAsToday();
    prevBtn.addEventListener("click", () => {
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      render();
    });

    const title = document.createElement("span");
    title.className = "calendar__title";
    title.textContent = `${MESES[viewMonth]} ${viewYear}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "calendar__nav";
    nextBtn.setAttribute("aria-label", "Próximo mês");
    nextBtn.textContent = "›";
    nextBtn.addEventListener("click", () => {
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      render();
    });

    header.append(prevBtn, title, nextBtn);
    wrap.appendChild(header);

    // Dias da semana
    const weekRow = document.createElement("div");
    weekRow.className = "calendar__weekdays";
    DIAS_SEMANA.forEach((d, i) => {
      const el = document.createElement("span");
      el.textContent = d;
      el.key = i;
      weekRow.appendChild(el);
    });
    wrap.appendChild(weekRow);

    // Grade de dias
    const grid = document.createElement("div");
    grid.className = "calendar__grid";

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < startWeekday; i++) {
      grid.appendChild(document.createElement("span"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const key = toKey(date);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar__day";
      btn.textContent = String(day);

      const past = isPast(date);
      const blocked = blockedDates.has(key);

      if (past) {
        btn.classList.add("is-disabled");
        btn.disabled = true;
      } else if (blocked) {
        btn.classList.add("is-blocked");
        btn.disabled = true;
        btn.title = "Fechado";
      } else {
        btn.addEventListener("click", () => {
          currentSelectedKey = key;
          render();
          onSelect && onSelect(key);
        });
      }

      if (key === currentSelectedKey) {
        btn.classList.add("is-selected");
      }
      if (key === toKey(today)) {
        btn.classList.add("is-today");
      }

      grid.appendChild(btn);
    }

    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  render();

  return {
    refreshBlockedDates(newBlocked) {
      blockedDates = newBlocked;
      render();
    },
    getSelectedKey() {
      return currentSelectedKey;
    }
  };
}

export { toKey, startOfDay };
