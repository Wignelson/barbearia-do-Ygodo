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

export async function ajustarDuracaoAgendamento(db, dateKey, horarioPrincipal, horarios, duracaoMinutos) {
  const agendaRef = ref(db, `appointments/${dateKey}`);
  const bloqueadosSnap = await get(ref(db, `blockedSlots/${dateKey}`));
  const bloqueados = bloqueadosSnap.val() || {};
  const horarioBloqueado = horarios.find((horario) => bloqueados[horario]);
  if (horarioBloqueado) {
    return { atualizado: false, motivo: "bloqueado" };
  }

  // Faz uma leitura atualizada antes da transação. A tela administrativa pode
  // estar exibindo uma lista antiga, e uma transação iniciada sem esse dado
  // local pode receber `null` e abortar antes de sincronizar com o servidor.
  await get(agendaRef);

  let motivoAbortamento = null;
  let atualizacaoAplicada = false;
  const resultado = await runTransaction(agendaRef, (agendaAtual) => {
    motivoAbortamento = null;
    atualizacaoAplicada = false;
    const agenda = agendaAtual || {};
    const agendamento = agenda[horarioPrincipal];
    if (!agendamento || agendamento.principal) {
      motivoAbortamento = "nao-encontrado";
      // Retornar os dados atuais permite que o Firebase compare com o servidor
      // e repita a função se o cache local ainda não contiver o agendamento.
      return agendaAtual;
    }
    const horariosAntigos = agendamento.horarios || [horarioPrincipal];
    const antigos = new Set(horariosAntigos);
    const conflito = horarios.find((horario) => agenda[horario] && !antigos.has(horario));
    if (conflito) {
      motivoAbortamento = `ocupado:${conflito}`;
      return agendaAtual;
    }

    const novaAgenda = { ...agenda };
    horariosAntigos.forEach((horario) => { delete novaAgenda[horario]; });
    novaAgenda[horarioPrincipal] = { ...agendamento, duracaoMinutos, horarios };
    horarios.slice(1).forEach((horario) => {
      novaAgenda[horario] = { principal: horarioPrincipal };
    });
    atualizacaoAplicada = true;
    return novaAgenda;
  }, { applyLocally: false });

  return {
    atualizado: resultado.committed && atualizacaoAplicada,
    motivo: resultado.committed && atualizacaoAplicada ? null : (motivoAbortamento || "ocupado")
  };
}
