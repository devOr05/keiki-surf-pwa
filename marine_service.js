// marine_service.js - Motor oceanográfico y meteorológico para KEIKI Escuela de Surf
// Spot: Los Acantilados, Mar del Plata, Argentina (Lat: -38.1033, Lon: -57.5750)

export const SPOT_CONFIG = {
  name: "Los Acantilados, Mar del Plata",
  latitude: -38.1033,
  longitude: -57.5750,
  timezone: "America/Argentina/Buenos_Aires",
  // Orientación de la costa en Acantilados: mira al Este / Sudeste (~110°)
  // Vientos de tierra (Offshore - limpian la ola): O, NO, SO (220° a 320°)
  // Vientos de mar (Onshore - pican la ola): E, SE, NE (40° a 160°)
};

export class MarineService {
  constructor() {
    this.cachedData = null;
    this.lastFetchTime = 0;
    this.CACHE_DURATION = 15 * 60 * 1000; // 15 minutos de caché
  }

  // Obtiene datos combinados de oleaje y viento
  async getSpotForecast(days = 4) {
    const now = Date.now();
    if (this.cachedData && (now - this.lastFetchTime < this.CACHE_DURATION)) {
      return this.cachedData;
    }

    try {
      const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${SPOT_CONFIG.latitude}&longitude=${SPOT_CONFIG.longitude}&hourly=wave_height,wave_direction,wave_period,wind_wave_height&timezone=${encodeURIComponent(SPOT_CONFIG.timezone)}&forecast_days=${days}`;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${SPOT_CONFIG.latitude}&longitude=${SPOT_CONFIG.longitude}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,weather_code&timezone=${encodeURIComponent(SPOT_CONFIG.timezone)}&forecast_days=${days}`;

      const [marineRes, weatherRes] = await Promise.all([
        fetch(marineUrl).then(r => r.json()),
        fetch(weatherUrl).then(r => r.json())
      ]);

      const processed = this.processForecast(marineRes, weatherRes);
      this.cachedData = processed;
      this.lastFetchTime = now;
      return processed;
    } catch (error) {
      console.warn("Error al consultar API en vivo, usando datos de respaldo/caché:", error);
      if (this.cachedData) return this.cachedData;
      return this.getMockForecast();
    }
  }

  processForecast(marine, weather) {
    const hourlyTimes = marine.hourly.time;
    const hours = [];

    for (let i = 0; i < hourlyTimes.length; i++) {
      const timeStr = hourlyTimes[i]; // formato: "2026-09-17T09:00"
      const waveHeight = marine.hourly.wave_height[i] ?? 0.8;
      const wavePeriod = marine.hourly.wave_period[i] ?? 8.0;
      const waveDirection = marine.hourly.wave_direction[i] ?? 120;
      const windSpeed = weather.hourly?.wind_speed_10m[i] ?? 14;
      const windDirection = weather.hourly?.wind_direction_10m[i] ?? 280;
      const windGusts = weather.hourly?.wind_gusts_10m[i] ?? 20;
      const temperature = weather.hourly?.temperature_2m[i] ?? 18;

      const dateObj = new Date(timeStr);
      const hourNumber = dateObj.getHours();

      // Solo evaluamos horas de luz solar para clases (07:00 a 19:00)
      const isDaylight = hourNumber >= 7 && hourNumber <= 19;

      const evaluation = this.evaluateConditions({
        waveHeight,
        wavePeriod,
        waveDirection,
        windSpeed,
        windDirection,
        windGusts
      });

      hours.push({
        time: timeStr,
        date: timeStr.split("T")[0],
        hour: hourNumber,
        isDaylight,
        waveHeight: Number(waveHeight.toFixed(2)),
        wavePeriod: Number(wavePeriod.toFixed(1)),
        waveDirection,
        windSpeed: Math.round(windSpeed),
        windDirection,
        windDirectionText: this.degreesToCardinal(windDirection),
        windType: this.classifyWind(windDirection),
        windGusts: Math.round(windGusts),
        temperature: Math.round(temperature),
        score: evaluation.score,
        status: evaluation.status,
        badgeColor: evaluation.badgeColor,
        reason: evaluation.reason,
        level: evaluation.level
      });
    }

    const dailySummary = this.groupDays(hours);
    const suggestions = this.generateSmartSuggestions(hours);

    return {
      current: this.findCurrentHour(hours),
      hours,
      dailySummary,
      suggestions,
      updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };
  }

  // Algoritmo de idoneidad para clases de iniciación y escuela
  evaluateConditions({ waveHeight, wavePeriod, windSpeed, windDirection, windGusts }) {
    let score = 100;
    const reasons = [];

    // 1. Evaluación de Altura de Ola (Para principiantes el rango ideal es 0.6m a 1.2m)
    if (waveHeight < 0.4) {
      score -= 40;
      reasons.push("Ola muy baja / mar casi plano");
    } else if (waveHeight >= 0.5 && waveHeight <= 1.2) {
      score += 0; // Ideal
      reasons.push("Altura de ola perfecta para aprendizaje (0.6 - 1.2m)");
    } else if (waveHeight > 1.2 && waveHeight <= 1.5) {
      score -= 20;
      reasons.push("Ola moderada-grande (apto intermedios o con asistencia)");
    } else if (waveHeight > 1.5 && waveHeight <= 2.0) {
      score -= 50;
      reasons.push("Mar con fuerza y tamaño; solo intermedios con experiencia");
    } else {
      score -= 80;
      reasons.push("Mar peligroso / oleaje excesivo (>2m)");
    }

    // 2. Evaluación de Período (Período > 8s = olas formadas; < 6s = mar desordenado)
    if (wavePeriod >= 9) {
      reasons.push("Excelente período (>9s), series ordenadas");
    } else if (wavePeriod >= 7) {
      score -= 5;
    } else {
      score -= 25;
      reasons.push("Período corto, olas seguidas y picadas");
    }

    // 3. Evaluación de Viento y Dirección en Acantilados
    const windType = this.classifyWind(windDirection);
    if (windType === "Offshore (Tierra)") {
      if (windSpeed <= 20) {
        reasons.push("Viento de tierra favorable, abre las olas");
      } else {
        score -= 20;
        reasons.push("Viento terral fuerte, dificulta la remada");
      }
    } else if (windType === "Onshore (Mar)") {
      if (windSpeed > 18) {
        score -= 40;
        reasons.push("Viento de mar picando la rompiente");
      } else if (windSpeed > 12) {
        score -= 15;
      }
    } else {
      // Cross-shore
      if (windSpeed > 22) {
        score -= 25;
        reasons.push("Viento cruzado con corriente");
      }
    }

    // Ráfagas
    if (windGusts > 35) {
      score -= 25;
      reasons.push("Ráfagas fuertes de viento");
    }

    score = Math.max(10, Math.min(100, score));

    let status = "OPTIMO";
    let badgeColor = "green";
    let level = "Iniciación y Todos los Niveles";

    if (score >= 70) {
      status = "OPTIMO";
      badgeColor = "emerald";
      level = "Ideal Iniciación";
    } else if (score >= 45) {
      status = "INTERMEDIO";
      badgeColor = "amber";
      level = "Intermedio / Con Criterio";
    } else {
      status = "NO_RECOMENDADO";
      badgeColor = "rose";
      level = "Condiciones Desfavorables";
    }

    return {
      score,
      status,
      badgeColor,
      reason: reasons[0] || "Condiciones estables",
      allReasons: reasons,
      level
    };
  }

  classifyWind(degrees) {
    // Acantilados costa mira al Este / Sudeste (~110°)
    // Viento de tierra: 210° a 340° (SO, O, NO)
    // Viento de mar: 40° a 160° (NE, E, SE)
    if (degrees >= 210 && degrees <= 340) {
      return "Offshore (Tierra)";
    } else if (degrees >= 40 && degrees <= 160) {
      return "Onshore (Mar)";
    }
    return "Cross (Cruzado)";
  }

  degreesToCardinal(deg) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
  }

  findCurrentHour(hours) {
    const now = new Date();
    const currentHourStr = now.toISOString().slice(0, 13); // "2026-09-17T14"
    return hours.find(h => h.time.startsWith(currentHourStr)) || hours[0];
  }

  groupDays(hours) {
    const days = {};
    for (const h of hours) {
      if (!days[h.date]) {
        days[h.date] = {
          date: h.date,
          dayLabel: this.formatDateLabel(h.date),
          hours: []
        };
      }
      days[h.date].hours.push(h);
    }

    return Object.values(days).map(d => {
      const daylightHours = d.hours.filter(h => h.isDaylight);
      const avgWave = daylightHours.reduce((acc, h) => acc + h.waveHeight, 0) / (daylightHours.length || 1);
      const avgWind = daylightHours.reduce((acc, h) => acc + h.windSpeed, 0) / (daylightHours.length || 1);
      const bestHour = [...daylightHours].sort((a, b) => b.score - a.score)[0] || daylightHours[0];

      return {
        ...d,
        avgWave: Number(avgWave.toFixed(2)),
        avgWind: Math.round(avgWind),
        bestHour,
        overallStatus: bestHour ? bestHour.status : "OPTIMO",
        overallScore: bestHour ? bestHour.score : 80
      };
    });
  }

  // Genera ventanas favorables para sugerir al instructor
  generateSmartSuggestions(hours) {
    const suggestions = [];
    const grouped = {};

    hours.filter(h => h.isDaylight).forEach(h => {
      if (!grouped[h.date]) grouped[h.date] = [];
      grouped[h.date].push(h);
    });

    for (const [date, dayHours] of Object.entries(grouped)) {
      // Buscar bloques de 2 o 3 horas consecutivas con score >= 65
      let currentWindow = [];
      for (const h of dayHours) {
        if (h.score >= 65) {
          currentWindow.push(h);
        } else {
          if (currentWindow.length >= 2) {
            suggestions.push(this.buildSuggestionObj(date, currentWindow));
          }
          currentWindow = [];
        }
      }
      if (currentWindow.length >= 2) {
        suggestions.push(this.buildSuggestionObj(date, currentWindow));
      }
    }

    return suggestions.slice(0, 4); // Las mejores 4 sugerencias
  }

  buildSuggestionObj(date, windowHours) {
    const startHour = windowHours[0].hour;
    const endHour = windowHours[windowHours.length - 1].hour + 1;
    const avgScore = Math.round(windowHours.reduce((acc, h) => acc + h.score, 0) / windowHours.length);
    const avgWave = (windowHours.reduce((acc, h) => acc + h.waveHeight, 0) / windowHours.length).toFixed(1);
    const primaryWind = windowHours[0].windType;
    const dateLabel = this.formatDateLabel(date);

    return {
      id: `sugg-${date}-${startHour}-${endHour}`,
      date,
      dateLabel,
      timeSlot: `${String(startHour).padStart(2, '0')}:00 a ${String(endHour).padStart(2, '0')}:00 hs`,
      slots: [
        { time: `${String(startHour).padStart(2, '0')}:00`, duration: "1h 30m" },
        ...(endHour - startHour >= 3 ? [{ time: `${String(startHour + 2).padStart(2, '0')}:00`, duration: "1h 30m" }] : [])
      ],
      avgWave: `${avgWave}m`,
      windInfo: `${windowHours[0].windSpeed} km/h ${windowHours[0].windDirectionText} (${primaryWind})`,
      score: avgScore,
      title: `Ventana Favorable: ${dateLabel} (${startHour}:00 - ${endHour}:00 hs)`,
      reason: `Mar calmo (${avgWave}m), período ordenado y viento ${primaryWind.toLowerCase()}. Ideal para abrir turnos de iniciación.`,
      recommendedCapacity: 3 // Máximo 3 por instructor según filosofía Keiki
    };
  }

  formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${days[date.getDay()]} ${d} de ${months[date.getMonth()]}`;
  }

  getMockForecast() {
    const mockHours = [];
    const today = new Date();
    for (let d = 0; d < 3; d++) {
      const cur = new Date(today);
      cur.setDate(today.getDate() + d);
      const dateStr = cur.toISOString().split('T')[0];

      for (let h = 7; h <= 19; h++) {
        const timeStr = `${dateStr}T${String(h).padStart(2, '0')}:00`;
        const wave = 0.8 + (h % 3) * 0.15;
        const wind = 10 + (h % 5) * 2;
        const evalRes = this.evaluateConditions({
          waveHeight: wave,
          wavePeriod: 9.0,
          windSpeed: wind,
          windDirection: 270,
          windGusts: wind + 6
        });

        mockHours.push({
          time: timeStr,
          date: dateStr,
          hour: h,
          isDaylight: true,
          waveHeight: Number(wave.toFixed(2)),
          wavePeriod: 9.0,
          waveDirection: 110,
          windSpeed: wind,
          windDirection: 270,
          windDirectionText: 'O',
          windType: 'Offshore (Tierra)',
          windGusts: wind + 6,
          temperature: 19,
          ...evalRes
        });
      }
    }

    return {
      current: mockHours[2] || mockHours[0],
      hours: mockHours,
      dailySummary: this.groupDays(mockHours),
      suggestions: this.generateSmartSuggestions(mockHours),
      updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };
  }
}
