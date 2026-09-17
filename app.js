// app.js - Lógica principal de la PWA KEIKI Escuela de Surf
import { MarineService, SPOT_CONFIG } from './marine_service.js';

const marineService = new MarineService();

// Estado inicial persistente
const STORAGE_KEY = 'keiki_surf_app_data_v1';

const DEFAULT_CONFIG = {
  schoolName: "KEIKI Escuela de Surf",
  location: "Los Acantilados, Calle 497 Nº 316, Mar del Plata",
  phone: "5492235254776", // WhatsApp oficial Keiki
  maxStudentsPerSlot: 3,
  classPrice: 25000,
  depositPercent: 50,
  alias: "KEIKI.SURF.MDP"
};

// Genera datos demo iniciales si no hay en localStorage
function getInitialData() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = dayAfter.toISOString().split('T')[0];

  return {
    config: { ...DEFAULT_CONFIG },
    slots: [
      {
        id: `slot-${tomorrowStr}-0930`,
        date: tomorrowStr,
        time: "09:30",
        duration: "1h 30m",
        instructor: "Joaquín (Keiki Coach)",
        capacity: 3,
        status: "ACTIVE", // ACTIVE, SUSPENDED, COMPLETED
        notes: "Marea baja subiendo, ideal para pararse por primera vez.",
        waveHeight: "0.8m",
        wind: "Offshore 12 km/h",
        students: [
          {
            id: "std-1",
            name: "Facundo Morales",
            phone: "+54 9 223 456-7890",
            level: "Primera vez",
            height: 178,
            weight: 74,
            suitSize: "L (4/3mm)",
            boardType: "Softboard 8'2\"",
            depositPaid: true,
            createdAt: new Date().toISOString()
          }
        ]
      },
      {
        id: `slot-${tomorrowStr}-1130`,
        date: tomorrowStr,
        time: "11:30",
        duration: "1h 30m",
        instructor: "Martín (Keiki Coach)",
        capacity: 3,
        status: "ACTIVE",
        notes: "Ventana con agua limpia y poco viento.",
        waveHeight: "0.9m",
        wind: "Offshore 14 km/h",
        students: []
      },
      {
        id: `slot-${dayAfterStr}-1000`,
        date: dayAfterStr,
        time: "10:00",
        duration: "1h 30m",
        instructor: "Joaquín (Keiki Coach)",
        capacity: 3,
        status: "ACTIVE",
        notes: "Oleaje ordenado de 8s de período.",
        waveHeight: "1.0m",
        wind: "Offshore 10 km/h",
        students: []
      }
    ],
    manualSeaAlert: null // Si el instructor pone un aviso de mar manual
  };
}

class KeikiApp {
  constructor() {
    this.marineData = null;
    this.currentView = 'student'; // 'student' | 'instructor'
    this.state = this.loadState();
    this.selectedSlotForBooking = null;

    this.init();
  }

  loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error("Error loading state:", e);
    }
    const initial = getInitialData();
    this.saveState(initial);
    return initial;
  }

  saveState(stateToSave = this.state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Error saving state:", e);
    }
  }

  async init() {
    this.bindGlobalEvents();
    await this.refreshMarineConditions();
    this.render();
  }

  bindGlobalEvents() {
    // Selector de vistas
    document.getElementById('btn-view-student')?.addEventListener('click', () => this.switchView('student'));
    document.getElementById('btn-view-instructor')?.addEventListener('click', () => this.switchView('instructor'));

    // Botón refrescar pronóstico
    document.getElementById('btn-refresh-marine')?.addEventListener('click', () => {
      this.refreshMarineConditions(true);
    });

    // Formulario de reserva
    const bookingForm = document.getElementById('form-booking');
    if (bookingForm) {
      bookingForm.addEventListener('submit', (e) => this.handleBookingSubmit(e));
      
      // Auto cálculo de equipo dinámico mientras escribe altura y peso
      const heightInput = document.getElementById('book-height');
      const weightInput = document.getElementById('book-weight');
      const updateEquipment = () => {
        const h = Number(heightInput?.value || 170);
        const w = Number(weightInput?.value || 70);
        const suggested = this.calculateEquipment(h, w);
        const suitEl = document.getElementById('preview-suit-size');
        const boardEl = document.getElementById('preview-board');
        if (suitEl) suitEl.textContent = suggested.suit;
        if (boardEl) boardEl.textContent = suggested.board;
      };
      heightInput?.addEventListener('input', updateEquipment);
      weightInput?.addEventListener('input', updateEquipment);
    }

    // Modal cerrar
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeBookingModal());
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') this.closeBookingModal();
    });

    // Modal nuevo turno manual (Instructor)
    document.getElementById('btn-new-slot')?.addEventListener('click', () => this.openManualSlotModal());
    document.getElementById('btn-close-slot-modal')?.addEventListener('click', () => this.closeManualSlotModal());
    document.getElementById('form-manual-slot')?.addEventListener('submit', (e) => this.handleManualSlotSubmit(e));
  }

  switchView(view) {
    this.currentView = view;
    const btnStudent = document.getElementById('btn-view-student');
    const btnInstructor = document.getElementById('btn-view-instructor');
    const viewStudent = document.getElementById('view-student');
    const viewInstructor = document.getElementById('view-instructor');

    if (view === 'student') {
      btnStudent?.classList.add('bg-white', 'text-sky-900', 'shadow-md');
      btnStudent?.classList.remove('text-sky-100', 'hover:bg-sky-700/50');
      btnInstructor?.classList.remove('bg-white', 'text-sky-900', 'shadow-md');
      btnInstructor?.classList.add('text-sky-100', 'hover:bg-sky-700/50');

      viewStudent?.classList.remove('hidden');
      viewInstructor?.classList.add('hidden');
    } else {
      btnInstructor?.classList.add('bg-white', 'text-sky-900', 'shadow-md');
      btnInstructor?.classList.remove('text-sky-100', 'hover:bg-sky-700/50');
      btnStudent?.classList.remove('bg-white', 'text-sky-900', 'shadow-md');
      btnStudent?.classList.add('text-sky-100', 'hover:bg-sky-700/50');

      viewInstructor?.classList.remove('hidden');
      viewStudent?.classList.add('hidden');
    }

    this.render();
  }

  async refreshMarineConditions(force = false) {
    const loadingEl = document.getElementById('marine-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    if (force) marineService.cachedData = null;
    this.marineData = await marineService.getSpotForecast(4);

    if (loadingEl) loadingEl.classList.add('hidden');
    this.renderMarineStatus();
    this.renderInstructorSuggestions();
  }

  // Renderiza el Semáforo del Mar y las métricas en tiempo real
  renderMarineStatus() {
    if (!this.marineData) return;
    const cur = this.marineData.current;

    // Métricas en la cabecera
    const waveEl = document.getElementById('metric-wave');
    const windEl = document.getElementById('metric-wind');
    const periodEl = document.getElementById('metric-period');
    const spotStatusBadge = document.getElementById('spot-status-badge');
    const spotStatusText = document.getElementById('spot-status-desc');
    const spotUpdateEl = document.getElementById('spot-updated-at');

    if (waveEl) waveEl.textContent = `${cur.waveHeight}m`;
    if (windEl) windEl.textContent = `${cur.windSpeed} km/h ${cur.windDirectionText} (${cur.windType})`;
    if (periodEl) periodEl.textContent = `${cur.wavePeriod}s`;
    if (spotUpdateEl) spotUpdateEl.textContent = `Actualizado ${this.marineData.updatedAt} hs`;

    // Semáforo dinámico
    if (spotStatusBadge && spotStatusText) {
      if (this.state.manualSeaAlert) {
        spotStatusBadge.className = 'px-3 py-1 text-xs font-black uppercase rounded-full bg-rose-500 text-white animate-pulse';
        spotStatusBadge.textContent = 'ALERTA / PAUSADO';
        spotStatusText.textContent = this.state.manualSeaAlert;
      } else if (cur.score >= 70) {
        spotStatusBadge.className = 'px-3 py-1 text-xs font-black uppercase rounded-full bg-emerald-500 text-white';
        spotStatusBadge.textContent = '🟢 CONDICIONES ÓPTIMAS';
        spotStatusText.textContent = `Mar ordenado con ola de ${cur.waveHeight}m y viento ${cur.windType.toLowerCase()}. Ideal para clases de iniciación.`;
      } else if (cur.score >= 45) {
        spotStatusBadge.className = 'px-3 py-1 text-xs font-black uppercase rounded-full bg-amber-500 text-white';
        spotStatusBadge.textContent = '🟡 NIVEL INTERMEDIO';
        spotStatusText.textContent = `Condición con oleaje moderado (${cur.waveHeight}m) o viento. Recomendado para alumnos con algo de experiencia.`;
      } else {
        spotStatusBadge.className = 'px-3 py-1 text-xs font-black uppercase rounded-full bg-rose-600 text-white';
        spotStatusBadge.textContent = '🔴 MAR EXIGENTE / PICADO';
        spotStatusText.textContent = `Viento u oleaje desfavorables para principiantes. El instructor evalúa turnos personalizados.`;
      }
    }
  }

  // Renderiza los turnos disponibles para los alumnos
  renderStudentSlots() {
    const container = document.getElementById('student-slots-container');
    if (!container) return;

    // Filtramos solo turnos activos ordenados por fecha y hora
    const activeSlots = this.state.slots
      .filter(s => s.status !== 'DELETED')
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    if (activeSlots.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm col-span-full">
          <div class="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-3 text-sky-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-slate-800">El instructor está chequeando las condiciones</h3>
          <p class="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Habilitamos las franjas horarias con 24 a 48 hs de antelación según el mar en Acantilados para asegurarte la mejor experiencia en el agua.
          </p>
          <a href="https://wa.me/${this.state.config.phone}?text=Hola%20Keiki%20Surf!%20Quería%20consultar%20por%20próximos%20turnos%20de%20clases" 
             target="_blank"
             class="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
            Consultar por WhatsApp
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = activeSlots.map(slot => {
      const enrolled = slot.students.length;
      const capacity = slot.capacity || this.state.config.maxStudentsPerSlot;
      const spotsLeft = Math.max(0, capacity - enrolled);
      const isFull = spotsLeft === 0;
      const isSuspended = slot.status === 'SUSPENDED';

      const dateObj = new Date(slot.date + 'T12:00:00');
      const formattedDate = dateObj.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
      const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

      return `
        <div class="bg-white rounded-2xl border ${isSuspended ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'} p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                isSuspended ? 'bg-rose-100 text-rose-700' :
                isFull ? 'bg-slate-100 text-slate-600' :
                spotsLeft === 1 ? 'bg-amber-100 text-amber-800 animate-pulse' :
                'bg-emerald-100 text-emerald-800'
              }">
                ${
                  isSuspended ? '⚠️ Turno Reprogramado' :
                  isFull ? '🔴 Cupos Completos' :
                  `🔥 ¡Quedan ${spotsLeft} de ${capacity} cupos!`
                }
              </span>
              <span class="text-xs text-slate-400 font-medium">Acantilados</span>
            </div>

            <h4 class="text-lg font-black text-slate-900 capitalize">${capitalizedDate}</h4>
            <div class="flex items-center gap-3 my-2 text-slate-700">
              <div class="flex items-center gap-1 font-extrabold text-sky-700 text-lg">
                <svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ${slot.time} hs
              </div>
              <span class="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold">${slot.duration || '1h 30m'}</span>
            </div>

            <p class="text-xs text-slate-500 mb-3 line-clamp-2">
              ${slot.notes || 'Clase guiada con instructor certificado, tabla softboard y traje incluido.'}
            </p>

            <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-100 mb-4 flex items-center justify-between text-xs text-slate-600">
              <span>🌊 Ola prevista: <strong>${slot.waveHeight || '0.8m'}</strong></span>
              <span>💨 Viento: <strong>${slot.wind || 'Offshore'}</strong></span>
            </div>
          </div>

          <div>
            ${
              isSuspended ? `
                <div class="text-center py-2 px-3 bg-rose-100/80 rounded-xl text-rose-800 text-xs font-semibold">
                  Turno suspendido por cambio en el mar. Escríbenos para reagendar.
                </div>
              ` : isFull ? `
                <button disabled class="w-full py-2.5 bg-slate-100 text-slate-400 text-sm font-semibold rounded-xl cursor-not-allowed">
                  Cupo Completo (3/3 alumnos)
                </button>
              ` : `
                <button onclick="window.app.openBookingModal('${slot.id}')" 
                        class="w-full py-3 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2">
                  <span>Reservar mi Lugar</span>
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
              `
            }
          </div>
        </div>
      `;
    }).join('');
  }

  // Renderiza las Sugerencias Inteligentes de la IA en la vista del Instructor
  renderInstructorSuggestions() {
    const container = document.getElementById('instructor-suggestions-container');
    if (!container) return;

    const suggestions = this.marineData?.suggestions || [];

    if (suggestions.length === 0) {
      container.innerHTML = `
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 text-sm">
          <div class="font-bold flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Sin ventanas recomendadas automáticas en los próximos 3 días
          </div>
          <p class="mt-1 text-xs text-amber-800">
            El modelo detecta mar con viento fuerte onshore o períodos muy cortos. Puedes habilitar turnos manualmente con tu propio criterio si lo deseas.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = suggestions.map(s => {
      return `
        <div class="bg-gradient-to-br from-white to-sky-50/50 rounded-2xl border-2 border-sky-200 p-5 shadow-sm relative overflow-hidden">
          <div class="absolute top-0 right-0 bg-sky-500 text-white px-3 py-1 rounded-bl-xl text-xs font-black tracking-wider flex items-center gap-1">
            <span>IA SCORE</span>
            <span class="text-yellow-300 font-extrabold">${s.score}/100</span>
          </div>

          <div class="pr-20">
            <span class="inline-block px-2.5 py-0.5 bg-sky-100 text-sky-800 text-xs font-bold rounded-lg mb-1">
              ${s.dateLabel}
            </span>
            <h4 class="text-base font-black text-slate-900">${s.timeSlot}</h4>
          </div>

          <p class="text-xs text-slate-600 mt-2 mb-3 bg-white/80 p-2.5 rounded-xl border border-sky-100">
            💡 <strong>Motivo técnico:</strong> ${s.reason}
          </p>

          <div class="grid grid-cols-2 gap-2 text-xs mb-4 text-slate-700">
            <div class="bg-white p-2 rounded-lg border border-slate-100">
              <span class="text-slate-400 block text-[10px]">ALTURA OLA</span>
              <span class="font-bold text-sky-900">${s.avgWave}</span>
            </div>
            <div class="bg-white p-2 rounded-lg border border-slate-100">
              <span class="text-slate-400 block text-[10px]">VIENTO COSTA</span>
              <span class="font-bold text-sky-900">${s.windInfo}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="window.app.approveSmartSuggestion('${s.id}')" 
                    class="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Aprobar y Habilitar Turnos (${s.recommendedCapacity} cupos)</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Renderiza la lista de turnos en el Panel de Administración
  renderInstructorSlots() {
    const container = document.getElementById('instructor-slots-container');
    if (!container) return;

    const slots = this.state.slots
      .filter(s => s.status !== 'DELETED')
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    if (slots.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-400 italic">No hay turnos creados todavía.</p>`;
      return;
    }

    container.innerHTML = slots.map(slot => {
      const enrolled = slot.students.length;
      const capacity = slot.capacity || this.state.config.maxStudentsPerSlot;
      const isSuspended = slot.status === 'SUSPENDED';

      return `
        <div class="bg-white rounded-2xl border ${isSuspended ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'} p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-extrabold text-slate-900 text-base">${slot.date} — ${slot.time} hs</span>
                <span class="px-2.5 py-0.5 text-xs font-bold rounded-full ${
                  isSuspended ? 'bg-rose-100 text-rose-700' :
                  enrolled >= capacity ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }">
                  ${isSuspended ? 'SUSPENDIDO' : `${enrolled}/${capacity} Inscriptos`}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">Instructor: ${slot.instructor || 'Keiki Coach'}</p>
            </div>

            <div class="flex items-center gap-2">
              ${
                !isSuspended ? `
                  <button onclick="window.app.toggleSuspendSlot('${slot.id}')" 
                          class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 border border-rose-200">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <span>Suspender por Mar & Avisar</span>
                  </button>
                ` : `
                  <button onclick="window.app.toggleSuspendSlot('${slot.id}')" 
                          class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition-colors border border-emerald-200">
                    Reactivar Turno
                  </button>
                `
              }
              <button onclick="window.app.deleteSlot('${slot.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 transition-colors" title="Eliminar turno">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <!-- Lista de Alumnos Inscriptos en este Turno -->
          <div>
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Alumnos en el Agua (${enrolled}):</h5>
            ${
              enrolled === 0 ? `
                <p class="text-xs text-slate-400 italic">No hay alumnos inscriptos aún.</p>
              ` : `
                <div class="space-y-2">
                  ${slot.students.map(st => `
                    <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <div class="font-bold text-slate-800 text-sm">${st.name}</div>
                        <div class="text-slate-500">${st.phone} • Nivel: <span class="font-medium text-sky-700">${st.level}</span></div>
                      </div>

                      <div class="flex items-center gap-2">
                        <span class="px-2 py-1 bg-sky-100/80 text-sky-900 rounded-md font-semibold" title="Traje recomendado">
                          🤿 Traje: ${st.suitSize}
                        </span>
                        <span class="px-2 py-1 bg-amber-100/80 text-amber-900 rounded-md font-semibold" title="Tabla recomendada">
                          🏄 Tabla: ${st.boardType}
                        </span>
                        <a href="https://wa.me/${st.phone.replace(/[^0-9]/g, '')}?text=Hola%20${encodeURIComponent(st.name)}!%20Te%20escribimos%20de%20Keiki%20Surf%20por%20tu%20clase%20del%20${slot.date}%20a%20las%20${slot.time}hs" 
                           target="_blank"
                           class="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                           title="Contactar alumno por WhatsApp">
                          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
                        </a>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `
            }
          </div>
        </div>
      `;
    }).join('');
  }

  // Suspender un turno por condiciones desfavorables y preparar mensaje a los alumnos
  toggleSuspendSlot(slotId) {
    const slot = this.state.slots.find(s => s.id === slotId);
    if (!slot) return;

    if (slot.status === 'SUSPENDED') {
      slot.status = 'ACTIVE';
    } else {
      slot.status = 'SUSPENDED';
      // Si tiene alumnos, mostrar modal/alerta de aviso
      if (slot.students.length > 0) {
        const studentNames = slot.students.map(s => s.name).join(', ');
        const waMsg = encodeURIComponent(
          `Hola! Te escribimos de KEIKI Escuela de Surf. Lamentablemente por rotación del viento / condiciones del mar en Acantilados, debemos reprogramar el turno del ${slot.date} a las ${slot.time} hs por seguridad. Te guardamos tu crédito para coordinar un nuevo horario. Disculpas por el imprevisto!`
        );

        alert(`⚠️ Turno suspendido.\nAlumnos afectados: ${studentNames}.\n\nSe ha preparado el aviso para cada alumno.`);
      }
    }

    this.saveState();
    this.render();
  }

  deleteSlot(slotId) {
    if (!confirm("¿Deseas eliminar este turno de la lista?")) return;
    this.state.slots = this.state.slots.filter(s => s.id !== slotId);
    this.saveState();
    this.render();
  }

  // Aprobar sugerencia inteligente de la IA
  approveSmartSuggestion(suggestionId) {
    const sugg = this.marineData?.suggestions?.find(s => s.id === suggestionId);
    if (!sugg) return;

    // Crear los slots sugeridos
    sugg.slots.forEach((item, index) => {
      const newSlotId = `slot-${sugg.date}-${item.time.replace(':', '')}`;
      // Verificar si ya existe
      if (!this.state.slots.some(s => s.id === newSlotId)) {
        this.state.slots.push({
          id: newSlotId,
          date: sugg.date,
          time: item.time,
          duration: item.duration,
          instructor: "Keiki Coach Asignado",
          capacity: sugg.recommendedCapacity || 3,
          status: "ACTIVE",
          notes: `Ventana sugerida por IA: ${sugg.reason}`,
          waveHeight: sugg.avgWave,
          wind: sugg.windInfo,
          students: []
        });
      }
    });

    this.saveState();
    this.render();
    alert(`✅ ¡Turnos habilitados para el ${sugg.dateLabel}! Los alumnos ya pueden verlos y reservar desde la PWA.`);
  }

  // Modal de Reserva Alumno
  openBookingModal(slotId) {
    const slot = this.state.slots.find(s => s.id === slotId);
    if (!slot) return;
    this.selectedSlotForBooking = slot;

    const modal = document.getElementById('modal-booking');
    const titleEl = document.getElementById('modal-slot-info');
    if (titleEl) {
      titleEl.innerHTML = `
        <div class="font-extrabold text-slate-900 text-lg">${slot.date} a las ${slot.time} hs</div>
        <div class="text-xs text-slate-500">Duración: ${slot.duration || '1h 30m'} • Cupo máximo: ${slot.capacity} alumnos</div>
      `;
    }

    // Reset fields
    document.getElementById('form-booking')?.reset();
    document.getElementById('preview-suit-size').textContent = "M (4/3mm)";
    document.getElementById('preview-board').textContent = "Softboard 8'2\"";

    modal?.classList.remove('hidden');
  }

  closeBookingModal() {
    this.selectedSlotForBooking = null;
    document.getElementById('modal-booking')?.classList.add('hidden');
  }

  // Algoritmo para estimar traje y tabla según antropometría
  calculateEquipment(heightCm, weightKg) {
    let suit = "M";
    if (heightCm < 155 || weightKg < 50) suit = "XS / Niño";
    else if (heightCm < 168 || weightKg < 62) suit = "S";
    else if (heightCm < 178 && weightKg < 76) suit = "M";
    else if (heightCm < 185 && weightKg < 88) suit = "L";
    else suit = "XL / XXL";

    let board = "Softboard 8'0\" Foamie";
    if (weightKg > 85 || heightCm > 185) {
      board = "Softboard 9'0\" High Float";
    } else if (weightKg < 55) {
      board = "Softboard 7'6\" Foamie";
    }

    return { suit: `${suit} (4/3mm sellado)`, board };
  }

  handleBookingSubmit(e) {
    e.preventDefault();
    if (!this.selectedSlotForBooking) return;

    const slot = this.state.slots.find(s => s.id === this.selectedSlotForBooking.id);
    if (!slot) return;

    const enrolled = slot.students.length;
    const capacity = slot.capacity || 3;
    if (enrolled >= capacity) {
      alert("Lo sentimos, este turno se acaba de completar. Por favor elige otro horario.");
      this.closeBookingModal();
      this.render();
      return;
    }

    const name = document.getElementById('book-name').value.trim();
    const phone = document.getElementById('book-phone').value.trim();
    const level = document.getElementById('book-level').value;
    const height = Number(document.getElementById('book-height').value);
    const weight = Number(document.getElementById('book-weight').value);
    const equip = this.calculateEquipment(height, weight);

    const newStudent = {
      id: `std-${Date.now()}`,
      name,
      phone,
      level,
      height,
      weight,
      suitSize: equip.suit,
      boardType: equip.board,
      depositPaid: false,
      createdAt: new Date().toISOString()
    };

    slot.students.push(newStudent);
    this.saveState();
    this.closeBookingModal();
    this.render();

    // Armar mensaje directo para WhatsApp de la escuela Keiki
    const message = `🌊 *NUEVA RESERVA - KEIKI ESCUELA DE SURF* 🏄\n\n` +
      `👤 *Alumno:* ${name}\n` +
      `📱 *WhatsApp:* ${phone}\n` +
      `📅 *Fecha:* ${slot.date}\n` +
      `⏰ *Hora:* ${slot.time} hs\n` +
      `🎯 *Nivel:* ${level}\n` +
      `📐 *Altura/Peso:* ${height}cm / ${weight}kg\n` +
      `🤿 *Traje asignado:* ${equip.suit}\n` +
      `🏄 *Tabla sugerida:* ${equip.board}\n\n` +
      `💵 *Seña:* 50% vía Alias (${this.state.config.alias})\n\n` +
      `_Enviado desde la PWA Keiki Surf_`;

    const waUrl = `https://wa.me/${this.state.config.phone}?text=${encodeURIComponent(message)}`;

    // Preguntar si quiere abrir WhatsApp ahora
    const confirmWa = confirm(
      `¡Excelente ${name}! Tu lugar ha sido pre-reservado con éxito.\n\nAhora abriremos WhatsApp para enviar la confirmación y la ficha de equipo directamente a Keiki Surf.`
    );

    if (confirmWa) {
      window.open(waUrl, '_blank');
    }
  }

  // Modal nuevo turno manual
  openManualSlotModal() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('manual-date');
    if (dateInput) dateInput.value = todayStr;
    document.getElementById('modal-manual-slot')?.classList.remove('hidden');
  }

  closeManualSlotModal() {
    document.getElementById('modal-manual-slot')?.classList.add('hidden');
  }

  handleManualSlotSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('manual-date').value;
    const time = document.getElementById('manual-time').value;
    const instructor = document.getElementById('manual-instructor').value.trim() || 'Keiki Coach';
    const capacity = Number(document.getElementById('manual-capacity').value) || 3;
    const notes = document.getElementById('manual-notes').value.trim();

    const id = `slot-${date}-${time.replace(':', '')}`;
    this.state.slots.push({
      id,
      date,
      time,
      duration: "1h 30m",
      instructor,
      capacity,
      status: "ACTIVE",
      notes: notes || "Turno habilitado manualmente por el instructor.",
      waveHeight: "A confirmar",
      wind: "Monitoreado en playa",
      students: []
    });

    this.saveState();
    this.closeManualSlotModal();
    this.render();
    alert("✅ Turno creado y habilitado en la PWA.");
  }

  render() {
    this.renderMarineStatus();
    if (this.currentView === 'student') {
      this.renderStudentSlots();
    } else {
      this.renderInstructorSuggestions();
      this.renderInstructorSlots();
    }
  }
}

// Inicializar y exponer a window para eventos inline
window.addEventListener('DOMContentLoaded', () => {
  window.app = new KeikiApp();
});
