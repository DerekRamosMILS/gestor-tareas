'use strict';

/* ==========================================================
   Cauce · Gestor de tareas de Afluente Datos
   ----------------------------------------------------------
   El código se organiza en tres clases:
   1. Tarea           → representa una tarea (modelo).
   2. GestorDeTareas  → guarda la lista y la persiste en
                        LocalStorage usando promesas.
   3. InterfazTareas  → manipula el DOM y responde a las
                        acciones del usuario.
   ========================================================== */

// ---------- Utilidades (funciones flecha) ----------

// Identificador único: usa crypto.randomUUID si existe y, si no, uno alternativo
const generarId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Evita que el texto del usuario se interprete como HTML (protege contra inyección)
const escaparHTML = (texto) =>
  String(texto).replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caracter]);

const formatearFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

// "1 tarea" / "3 tareas"
const plural = (cantidad, singular, pluralTexto = `${singular}s`) =>
  `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;

// Promesa que se resuelve después de cierto tiempo (para animaciones)
const esperar = (milisegundos) => new Promise((resolver) => setTimeout(resolver, milisegundos));


/* ==========================================================
   1. Clase Tarea
   ========================================================== */
class Tarea {
  static LONGITUD_MAXIMA = 120;

  constructor(nombre, completada = false, id = generarId(), creadaEn = new Date().toISOString()) {
    this.id = id;
    this.nombre = Tarea.validarNombre(nombre);
    this.completada = completada;
    this.creadaEn = creadaEn;
  }

  // Limpia el texto y lanza un error con un mensaje claro si no es válido
  static validarNombre(nombre) {
    const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');

    if (limpio.length === 0) {
      throw new Error('Escribe el nombre de la tarea antes de agregarla.');
    }
    if (limpio.length > Tarea.LONGITUD_MAXIMA) {
      throw new Error(`El nombre no puede pasar de ${Tarea.LONGITUD_MAXIMA} caracteres.`);
    }
    return limpio;
  }

  // Reconstruye una tarea a partir de un objeto guardado en LocalStorage
  static desdeObjeto({ id, nombre, completada, creadaEn }) {
    return new Tarea(nombre, Boolean(completada), id, creadaEn);
  }

  // Cambia el estado: sin argumento alterna entre completa e incompleta
  actualizarEstado(completada = !this.completada) {
    this.completada = completada;
    return this;
  }

  editar(nuevoNombre) {
    this.nombre = Tarea.validarNombre(nuevoNombre);
    return this;
  }

  // Devuelve una nueva lista sin esta tarea (no modifica la lista original)
  eliminar(lista) {
    return lista.filter((tarea) => tarea.id !== this.id);
  }

  // Define qué datos se guardan cuando se convierte a JSON
  toJSON() {
    const { id, nombre, completada, creadaEn } = this;
    return { id, nombre, completada, creadaEn };
  }
}


/* ==========================================================
   2. Clase GestorDeTareas
   ========================================================== */
class GestorDeTareas {
  constructor(claveAlmacenamiento = 'afluente.cauce.tareas') {
    this.clave = claveAlmacenamiento;
    this.tareas = [];
    this.respaldo = null; // copia previa para poder deshacer una eliminación
  }

  // ----- Datos calculados (getters) -----
  get total() {
    return this.tareas.length;
  }

  get completadas() {
    return this.tareas.filter((tarea) => tarea.completada).length;
  }

  get pendientes() {
    return this.total - this.completadas;
  }

  get porcentajeAvance() {
    return this.total === 0 ? 0 : Math.round((this.completadas / this.total) * 100);
  }

  // ----- Consultas -----
  buscarTarea(id) {
    const tarea = this.tareas.find((t) => t.id === id);
    if (!tarea) throw new Error('No se encontró la tarea.');
    return tarea;
  }

  existeNombre(nombre, idExcluido = null) {
    const buscado = nombre.toLocaleLowerCase('es');
    return this.tareas.some((t) => t.id !== idExcluido && t.nombre.toLocaleLowerCase('es') === buscado);
  }

  filtrar(filtro = 'todas') {
    const criterios = {
      todas: () => true,
      pendientes: (tarea) => !tarea.completada,
      completadas: (tarea) => tarea.completada,
    };
    return this.tareas.filter(criterios[filtro] ?? criterios.todas);
  }

  // ----- Persistencia en LocalStorage con promesas -----
  guardar() {
    return new Promise((resolver, rechazar) => {
      try {
        localStorage.setItem(this.clave, JSON.stringify(this.tareas));
        resolver(this.tareas.length);
      } catch (error) {
        rechazar(new Error('No se pudieron guardar las tareas en este navegador.'));
      }
    });
  }

  cargar() {
    return new Promise((resolver, rechazar) => {
      try {
        const datos = JSON.parse(localStorage.getItem(this.clave) ?? '[]');
        // Si algún registro guardado está dañado, se omite en lugar de romper la app
        this.tareas = Array.isArray(datos)
          ? datos.flatMap((dato) => {
              try {
                return [Tarea.desdeObjeto(dato)];
              } catch {
                return [];
              }
            })
          : [];
        resolver(this.tareas);
      } catch (error) {
        rechazar(new Error('No se pudieron leer las tareas guardadas.'));
      }
    });
  }

  // ----- Operaciones (async/await sobre las promesas de guardado) -----
  async agregarTarea(nombre) {
    const tarea = new Tarea(nombre);
    if (this.existeNombre(tarea.nombre)) {
      throw new Error(`Ya existe una tarea llamada "${tarea.nombre}".`);
    }
    this.tareas = [tarea, ...this.tareas]; // la más reciente va primero
    this.respaldo = null;
    await this.guardar();
    return tarea;
  }

  async editarTarea(id, nuevoNombre) {
    const tarea = this.buscarTarea(id);
    const limpio = Tarea.validarNombre(nuevoNombre);
    if (this.existeNombre(limpio, id)) {
      throw new Error(`Ya existe una tarea llamada "${limpio}".`);
    }
    tarea.editar(limpio);
    this.respaldo = null;
    await this.guardar();
    return tarea;
  }

  async cambiarEstado(id) {
    const tarea = this.buscarTarea(id).actualizarEstado();
    this.respaldo = null;
    await this.guardar();
    return tarea;
  }

  async eliminarTarea(id) {
    const tarea = this.buscarTarea(id);
    this.respaldo = [...this.tareas];
    this.tareas = tarea.eliminar(this.tareas);
    await this.guardar();
    return tarea;
  }

  async eliminarCompletadas() {
    const completadas = this.tareas.filter((tarea) => tarea.completada);
    if (completadas.length === 0) return 0;

    this.respaldo = [...this.tareas];
    completadas.forEach((tarea) => {
      this.tareas = tarea.eliminar(this.tareas);
    });
    await this.guardar();
    return completadas.length;
  }

  async deshacer() {
    if (!this.respaldo) return false;
    this.tareas = this.respaldo;
    this.respaldo = null;
    await this.guardar();
    return true;
  }
}


/* ==========================================================
   3. Clase InterfazTareas (manipulación del DOM)
   ========================================================== */
class InterfazTareas {
  constructor(gestor) {
    this.gestor = gestor;
    this.filtro = 'todas';
    this.idEnEdicion = null;
    this.temporizadorAviso = null;
    this.movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Referencias a los elementos del DOM
    const $ = (selector) => document.querySelector(selector);
    this.formulario = $('#form-tarea');
    this.input = $('#input-tarea');
    this.error = $('#mensaje-error');
    this.lista = $('#lista-tareas');
    this.tituloLista = $('#titulo-lista');
    this.vacio = $('#estado-vacio');
    this.vacioTexto = $('#estado-vacio-texto');
    this.contador = $('#contador');
    this.btnLimpiar = $('#btn-limpiar');
    this.botonesFiltro = document.querySelectorAll('[data-filtro]');
    this.aviso = $('#aviso');
    this.avisoTexto = $('#aviso-texto');
    this.btnDeshacer = $('#btn-deshacer');
    this.anunciador = $('#anunciador');
    this.resumen = {
      total: $('#dato-total'),
      pendientes: $('#dato-pendientes'),
      completadas: $('#dato-completadas'),
      porcentaje: $('#dato-porcentaje'),
      barra: $('#barra-progreso'),
      relleno: $('#relleno-progreso'),
    };
  }

  // Carga las tareas guardadas (cadena de promesas con then/catch/finally)
  iniciar() {
    this.registrarEventos();
    this.mostrarFecha();

    return this.gestor.cargar()
      .then((tareas) => console.info(`Cauce listo: ${plural(tareas.length, 'tarea')} cargadas desde LocalStorage.`))
      .catch((error) => this.mostrarError(error.message))
      .finally(() => this.renderizar());
  }

  // ----- Eventos -----
  registrarEventos() {
    this.formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      this.agregar();
    });

    this.input.addEventListener('input', () => this.limpiarError());

    // Delegación de eventos: un solo listener atiende los botones de todas las tareas
    this.lista.addEventListener('click', (evento) => {
      const boton = evento.target.closest('button[data-accion]');
      if (!boton) return;

      const { accion, id } = boton.dataset;
      const acciones = {
        editar: () => this.iniciarEdicion(id),
        eliminar: () => this.eliminar(id),
        cancelar: () => this.cancelarEdicion(),
      };
      acciones[accion]?.();
    });

    this.lista.addEventListener('change', (evento) => {
      if (evento.target.matches('.tarea__check')) this.cambiarEstado(evento.target.dataset.id);
    });

    this.lista.addEventListener('submit', (evento) => {
      evento.preventDefault();
      this.guardarEdicion(evento.target);
    });

    this.lista.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && this.idEnEdicion) this.cancelarEdicion();
    });

    this.botonesFiltro.forEach((boton) => {
      boton.addEventListener('click', () => this.cambiarFiltro(boton.dataset.filtro));
    });

    this.btnLimpiar.addEventListener('click', () => this.limpiarCompletadas());
    this.btnDeshacer.addEventListener('click', () => this.deshacer());

    // El aviso no se oculta mientras el usuario lo está usando
    ['mouseenter', 'focusin'].forEach((tipo) =>
      this.aviso.addEventListener(tipo, () => clearTimeout(this.temporizadorAviso)));
    ['mouseleave', 'focusout'].forEach((tipo) =>
      this.aviso.addEventListener(tipo, () => this.programarCierreAviso()));

    // Si las tareas cambian en otra pestaña, se sincronizan aquí
    window.addEventListener('storage', (evento) => {
      if (evento.key !== this.gestor.clave) return;
      this.gestor.cargar().then(() => this.renderizar());
    });
  }

  // ----- Acciones del usuario -----
  async agregar() {
    try {
      const tarea = await this.gestor.agregarTarea(this.input.value);
      this.input.value = '';
      this.limpiarError();
      this.ocultarAviso();
      if (this.filtro === 'completadas') this.cambiarFiltro('todas');
      this.renderizar();
      this.resaltar(tarea.id);
      this.anunciar(`Tarea agregada: ${tarea.nombre}`);
    } catch (error) {
      this.mostrarError(error.message);
    }
    this.input.focus();
  }

  iniciarEdicion(id) {
    this.idEnEdicion = id;
    this.limpiarError();
    this.renderizar();
    const campo = document.getElementById(`editar-${id}`);
    campo?.focus();
    campo?.select();
  }

  async guardarEdicion(formulario) {
    const { id } = formulario.dataset;
    const campo = formulario.querySelector('.tarea__campo');
    try {
      const tarea = await this.gestor.editarTarea(id, campo.value);
      this.idEnEdicion = null;
      this.ocultarAviso();
      this.renderizar();
      this.resaltar(id);
      this.enfocar(`[data-accion="editar"][data-id="${id}"]`);
      this.anunciar(`Tarea actualizada: ${tarea.nombre}`);
    } catch (error) {
      formulario.querySelector('.tarea__error').textContent = error.message;
      campo.setAttribute('aria-invalid', 'true');
      campo.focus();
    }
  }

  cancelarEdicion() {
    const id = this.idEnEdicion;
    this.idEnEdicion = null;
    this.renderizar();
    this.enfocar(`[data-accion="editar"][data-id="${id}"]`);
  }

  async cambiarEstado(id) {
    try {
      const tarea = await this.gestor.cambiarEstado(id);
      this.ocultarAviso();
      this.renderizar();
      this.enfocar(`#check-${id}`);
      this.anunciar(`${tarea.nombre}: ${tarea.completada ? 'completada' : 'pendiente'}`);
    } catch (error) {
      this.mostrarError(error.message);
      this.renderizar();
    }
  }

  async eliminar(id) {
    const elemento = this.lista.querySelector(`.tarea[data-id="${id}"]`);
    elemento?.classList.add('tarea--saliendo');
    await esperar(this.movimientoReducido ? 0 : 180);

    try {
      const tarea = await this.gestor.eliminarTarea(id);
      if (this.idEnEdicion === id) this.idEnEdicion = null;
      this.renderizar();
      this.mostrarAviso(`Se eliminó "${tarea.nombre}".`);
      this.anunciar(`Tarea eliminada: ${tarea.nombre}. Puedes deshacer la acción.`);
      this.input.focus();
    } catch (error) {
      this.mostrarError(error.message);
      this.renderizar();
    }
  }

  async limpiarCompletadas() {
    try {
      const cantidad = await this.gestor.eliminarCompletadas();
      if (cantidad === 0) return;
      this.idEnEdicion = null;
      this.renderizar();
      this.mostrarAviso(`Se eliminaron ${plural(cantidad, 'tarea completada', 'tareas completadas')}.`);
      this.anunciar(`Se eliminaron ${plural(cantidad, 'tarea completada', 'tareas completadas')}.`);
    } catch (error) {
      this.mostrarError(error.message);
    }
  }

  async deshacer() {
    const restaurado = await this.gestor.deshacer();
    this.ocultarAviso();
    if (!restaurado) return;
    this.renderizar();
    this.anunciar('Se restauró lo que eliminaste.');
    this.input.focus();
  }

  cambiarFiltro(filtro) {
    this.filtro = filtro;
    this.idEnEdicion = null;
    this.botonesFiltro.forEach((boton) => {
      boton.setAttribute('aria-pressed', String(boton.dataset.filtro === filtro));
    });
    this.renderizar();
  }

  // ----- Renderizado (plantillas con template literals) -----
  plantillaTarea({ id, nombre, completada, creadaEn }) {
    const nombreSeguro = escaparHTML(nombre);
    return `
      <li class="tarea ${completada ? 'tarea--completada' : ''}" data-id="${id}">
        <input type="checkbox" class="tarea__check" id="check-${id}" data-id="${id}" ${completada ? 'checked' : ''}>
        <label class="tarea__texto" for="check-${id}">
          <span class="tarea__nombre">${nombreSeguro}</span>
          <span class="tarea__meta">${completada ? 'Completada' : 'Pendiente'} · Creada el ${formatearFecha(creadaEn)}</span>
        </label>
        <div class="tarea__acciones">
          <button type="button" class="boton-accion" data-accion="editar" data-id="${id}"
                  aria-label="Editar la tarea ${nombreSeguro}">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>
            Editar
          </button>
          <button type="button" class="boton-accion boton-accion--peligro" data-accion="eliminar" data-id="${id}"
                  aria-label="Eliminar la tarea ${nombreSeguro}">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>
            Eliminar
          </button>
        </div>
      </li>`;
  }

  plantillaEdicion({ id, nombre }) {
    return `
      <li class="tarea tarea--editando" data-id="${id}">
        <form class="tarea__edicion" data-id="${id}" novalidate>
          <label class="sr-only" for="editar-${id}">Nuevo nombre de la tarea</label>
          <input type="text" class="tarea__campo" id="editar-${id}" value="${escaparHTML(nombre)}"
                 maxlength="${Tarea.LONGITUD_MAXIMA}" autocomplete="off" aria-describedby="error-${id}">
          <div class="tarea__acciones">
            <button type="submit" class="boton-accion boton-accion--guardar">Guardar</button>
            <button type="button" class="boton-accion" data-accion="cancelar">Cancelar</button>
          </div>
          <p class="tarea__error" id="error-${id}" role="alert"></p>
        </form>
      </li>`;
  }

  renderizar() {
    const visibles = this.gestor.filtrar(this.filtro);

    let html = '';
    visibles.forEach((tarea) => {
      html += tarea.id === this.idEnEdicion ? this.plantillaEdicion(tarea) : this.plantillaTarea(tarea);
    });
    this.lista.innerHTML = html;

    this.actualizarEstadoVacio(visibles.length);
    this.actualizarResumen();
  }

  actualizarEstadoVacio(cantidadVisible) {
    const mensajes = {
      todas: 'Aún no hay tareas. Escribe la primera para empezar.',
      pendientes: 'No hay tareas pendientes. Todo fluye.',
      completadas: 'Todavía no hay tareas completadas.',
    };
    this.vacio.hidden = cantidadVisible > 0;
    this.vacioTexto.textContent = mensajes[this.filtro];
  }

  actualizarResumen() {
    const { total, pendientes, completadas, porcentajeAvance } = this.gestor;

    this.resumen.total.textContent = total;
    this.resumen.pendientes.textContent = pendientes;
    this.resumen.completadas.textContent = completadas;
    this.resumen.porcentaje.textContent = `${porcentajeAvance}%`;
    this.resumen.barra.setAttribute('aria-valuenow', porcentajeAvance);
    this.resumen.relleno.style.width = `${porcentajeAvance}%`;

    this.contador.textContent = total === 0
      ? 'Sin tareas registradas'
      : `${plural(pendientes, 'pendiente')} de ${plural(total, 'tarea')}`;
    this.btnLimpiar.disabled = completadas === 0;
  }

  // ----- Mensajes y ayudas visuales -----
  mostrarFecha() {
    const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    document.querySelector('#fecha-hoy').textContent = `Hoy es ${hoy}`;
  }

  mostrarError(mensaje) {
    this.error.textContent = mensaje;
    this.input.setAttribute('aria-invalid', 'true');
    this.input.classList.add('campo--error');
  }

  limpiarError() {
    this.error.textContent = '';
    this.input.removeAttribute('aria-invalid');
    this.input.classList.remove('campo--error');
  }

  mostrarAviso(texto) {
    this.avisoTexto.textContent = texto;
    this.aviso.hidden = false;
    this.programarCierreAviso();
  }

  programarCierreAviso() {
    clearTimeout(this.temporizadorAviso);
    this.temporizadorAviso = setTimeout(() => this.ocultarAviso(), 6000);
  }

  ocultarAviso() {
    clearTimeout(this.temporizadorAviso);
    this.aviso.hidden = true;
  }

  anunciar(texto) {
    this.anunciador.textContent = '';
    requestAnimationFrame(() => {
      this.anunciador.textContent = texto;
    });
  }

  resaltar(id) {
    this.lista.querySelector(`.tarea[data-id="${id}"]`)?.classList.add('tarea--resaltada');
  }

  // Devuelve el foco a un elemento; si ya no está visible, lo lleva al título de la lista
  enfocar(selector) {
    (this.lista.querySelector(selector) ?? this.tituloLista).focus();
  }
}


// ---------- Arranque de la aplicación ----------
document.addEventListener('DOMContentLoaded', () => {
  const app = new InterfazTareas(new GestorDeTareas());
  app.iniciar();
});
