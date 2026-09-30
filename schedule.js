import { get, ref, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Reserva todos os blocos de um serviço numa única transação por dia.
// A transação é repetida pelo Firebase se outra reserva alterar o mesmo dia.
export async function reservarHorarios(db, dateKey, horarioPrincipal, horarios, dados, { allowClosedDate = false } = {}) {
  const [diaFechadoSnap, bloqueadosSnap] = await Promise.all([
    get(ref(db, `blockedDates/${dateKey}`)),
    get(ref(db, `blockedSlots/${dateKey}`))
  ]);
  if (!allowClosedDate && diaFechadoSnap.val() === true) {
    return { reservado: false, motivo: "dia-fechado" };
  }
  const bloqueados = bloqueadosSnap.exists() ? bloqueadosSnap.val() : {};
  if (horarios.some((horario) => bloqueados[horario])) {
    return { reservado: false, motivo: "bloqueado" };
  }

  const resultado = await runTransaction(
    ref(db, `appointments/${dateKey}`),
    (agendaAtual) => {
      const agenda = agendaAtual || {};
      if (horarios.some((horario) => agenda[horario])) return;

      const novaAgenda = { ...agenda };
      novaAgenda[horarioPrincipal] = { ...dados, horarios };
      horarios.slice(1).forEach((horario) => {
        novaAgenda[horario] = { principal: horarioPrincipal };
      });
      return novaAgenda;
    },
    { applyLocally: false }
  );

  return { reservado: resultado.committed, motivo: resultado.committed ? null : "ocupado" };
}
