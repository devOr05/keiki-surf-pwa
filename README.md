# 🏄 KEIKI Escuela de Surf - PWA de Reservas & Monitoreo Marino

Progressive Web App (PWA) móvil y de escritorio desarrollada para **KEIKI Escuela de Surf** (Los Acantilados, Mar del Plata, Argentina).

La plataforma resuelve la dependencia de las condiciones del mar mediante un **Asistente Oceanográfico Inteligente (IA)** que monitorea en tiempo real el oleaje y los vientos costeros, sugiriendo al instructor las ventanas horarias óptimas para abrir turnos de aprendizaje y permitiendo suspender o reprogramar clases con un solo toque.

---

## 🌊 Características Principales

### 1. Motor Meteorológico y Oceanográfico en Vivo
* Conexión satelital a **Open-Meteo Marine & Forecast API** con coordenadas de **Los Acantilados (-38.1033, -57.5750)**.
* Evaluación de:
  * **Altura de ola ($H_s$):** Rango de aprendizaje (0.6m - 1.2m).
  * **Período ($T_p$):** Olas ordenadas (&gt;8s).
  * **Viento costero:** Detección de *Offshore* (terral: O, NO, SO 🟢) vs. *Onshore* (mar: E, SE, NE 🔴).
* **Semáforo Marino:** 🟢 Óptimo Iniciación | 🟡 Nivel Intermedio | 🔴 Condiciones Desfavorables.

### 2. Panel de Control del Instructor (Asistente IA)
* **Radar de Oportunidades:** Detecta bloques favorables en los próximos 4 días con puntaje de idoneidad (0-100).
* **Aprobación en 1 Toque:** Abre turnos públicos con ratio de seguridad (**máximo 3 alumnos por instructor**).
* **Botón de Emergencia (`🚨 Suspender por Mar & Avisar`):** Cambia el estado del turno y prepara los mensajes de WhatsApp automáticos para todos los inscriptos.
* **Logística de Equipos:** Previsualiza trajes y tablas a preparar para cada turno.

### 3. Portal del Alumno (Experiencia Mobile First PWA)
* Consulta el estado del mar en tiempo real antes de reservar.
* Visualiza cupos restantes en vivo (*"¡Queda 1 de 3 cupos!"*).
* **Calculadora Antropométrica:** Sugiere automáticamente el talle de traje de neopreno (4/3mm) y la tabla softboard según altura y peso.
* **Confirmación por WhatsApp:** Redirige con la ficha completa al WhatsApp oficial de Keiki (`+54 9 223 525-4776`).

---

## 🚀 Despliegue en Vercel

1. Ingresa a [vercel.com/new](https://vercel.com/new).
2. Selecciona **Import** en el repositorio `devOr05/keiki-surf-pwa`.
3. Haz clic en **Deploy**.
4. ¡Listo! Tendrás tu URL HTTPS pública y lista para agregar en la biografía de Instagram (`@keikiescueladesurf`).

---

## 💻 Ejecución Local

```bash
# Iniciar servidor local
node server.js
```
Abre en tu navegador [http://localhost:3456/](http://localhost:3456/)

---

## 📄 Documentación Técnica
El repositorio incluye el informe técnico completo en formato PDF:
* [`Informe_Keiki_Surf_PWA.pdf`](./Informe_Keiki_Surf_PWA.pdf)
