const botonesNavegacion = [
    document.getElementById('nav-dashboard'),
    document.getElementById('nav-calendario'),
    document.getElementById('nav-historial')
];
const vistas = [
    document.getElementById('vista-dashboard'),
    document.getElementById('vista-calendario'),
    document.getElementById('vista-historial')
];

function cambiarVista(vistaDestino) {
    vistas.forEach((vista) => vista.classList.add('hidden'));
    document.getElementById(vistaDestino).classList.remove('hidden');

    botonesNavegacion.forEach((boton) => {
        boton.classList.remove(
            'bg-emerald-600/20',
            'text-emerald-400',
            'border',
            'border-emerald-500/30'
        );
        boton.classList.add('text-slate-300', 'hover:bg-slate-700/50');
    });

    const botonActivo = document.getElementById(vistaDestino.replace('vista-', 'nav-'));
    botonActivo.classList.remove('text-slate-300', 'hover:bg-slate-700/50');
    botonActivo.classList.add(
        'bg-emerald-600/20',
        'text-emerald-400',
        'border',
        'border-emerald-500/30'
    );
}

botonesNavegacion.forEach((boton) => {
    boton.addEventListener('click', (e) => {
        e.preventDefault();
        cambiarVista(boton.id.replace('nav-', 'vista-'));
    });
});

// 1. Inicializar conexión directa con Supabase
const supabaseUrl = 'https://sfgrxnrsayrinsgiuaei.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZ3J4bnJzYXlyaW5zZ2l1YWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDU2ODksImV4cCI6MjEwOTQ4MTY4OX0.S5L67Q0pyPlt6FX6z7V0sDbm7wZ_RfLlfywR5_iPRkc';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

// 2. Solicitar permisos para Notificaciones Nativas del Navegador (Notification API)
if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
}

// 3. RF1: Guardar Calendario en la base de datos
document.getElementById('form-calendario').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    // Capturar los días seleccionados
    const checkboxes = document.querySelectorAll('input[name="dias"]:checked');
    const diasSeleccionados = Array.from(checkboxes).map(cb => cb.value);

    // Capturar la hora y añadirle los segundos (PostgreSQL exige HH:MM:SS)
    const horaSeleccionada = document.getElementById('hora-riego').value + ":00";

    const { data, error } = await client
        .from('calendario_riego')
        .insert([{
            id_usuario: '67c377f0-c001-4704-97b3-fac87351f07e', // Usuario hardcodeado de tu prueba
            id_configuracion: 1,
            dias_semana: diasSeleccionados,
            hora_riego: horaSeleccionada,
            duracion_minutos: 15,
            activo: true
        }]);

    if (error) {
        console.error('Error guardando:', error);
        alert('Hubo un error al guardar el calendario.');
    } else {
        alert('Calendario de riego programado exitosamente.');
        await cargarCalendarios();
    }
});

// 4. RF2: Motor de Alertas en Tiempo Real
let ultimoMinutoRevisado = -1;

setInterval(async () => {
    const ahora = new Date();
    const minutoActual = ahora.getMinutes();

    // Solo ejecutamos la consulta 1 vez cuando cambia el minuto exacto
    if (minutoActual === ultimoMinutoRevisado) return;
    ultimoMinutoRevisado = minutoActual;

    const horaActualStr = ahora.toTimeString().slice(0, 5) + ":00";
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const diaHoy = diasSemana[ahora.getDay()];

    console.log(`[${horaActualStr}] Verificando riegos para hoy ${diaHoy}...`);

    // Consultamos todos los riegos activos de esa hora
    const { data: riegos, error } = await client
        .from('calendario_riego')
        .select('*')
        .eq('activo', true)
        .eq('hora_riego', horaActualStr);

    if (error) {
        console.error("Error consultando Supabase:", error.message);
        return;
    }

    // Filtramos en JavaScript para evitar conflictos de tipos de Array en Postgres
    const riegosDeHoy = riegos.filter(r => r.dias_semana && r.dias_semana.includes(diaHoy));

    if (riegosDeHoy.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
        new Notification("Alerta de Riego (OrchidCare IoT)", {
            body: "Riego automático activado para Sector Orquídeas Demo",
            icon: "https://cdn-icons-png.flaticon.com/512/2928/2928883.png"
        });
        console.log("¡Notificación enviada al sistema operativo!");
    }
}, 1000);

// 5. RF4 y RF7: Actualizar las lecturas ambientales más recientes
async function actualizarPanelAmbiental() {
    const { data: lecturas, error } = await client
        .from('registro_ambiental')
        .select('humedad_relativa, temperatura_c, fuera_de_rango, fecha_hora_lectura')
        .order('fecha_hora_lectura', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error consultando el registro ambiental:', error.message);
        return;
    }

    const lectura = lecturas[0];
    const valHumedad = document.getElementById('val-humedad');
    const valTemperatura = document.getElementById('val-temperatura');
    const statusHumedad = document.getElementById('status-humedad');
    const statusTemperatura = document.getElementById('status-temperatura');

    if (!lectura) {
        valHumedad.textContent = '-- %';
        valTemperatura.textContent = '-- °C';
        statusHumedad.textContent = 'Óptimo (~80%)';
        statusTemperatura.textContent = 'En Rango';
        statusHumedad.classList.remove('bg-red-500/20', 'text-red-400');
        statusTemperatura.classList.remove('bg-red-500/20', 'text-red-400');
        statusHumedad.classList.add('bg-emerald-500/20', 'text-emerald-400');
        statusTemperatura.classList.add('bg-emerald-500/20', 'text-emerald-400');
        return;
    }

    valHumedad.textContent = `${lectura.humedad_relativa} %`;
    valTemperatura.textContent = `${lectura.temperatura_c} °C`;

    if (lectura.fuera_de_rango) {
        statusHumedad.classList.replace('bg-emerald-500/20', 'bg-red-500/20');
        statusHumedad.classList.replace('text-emerald-400', 'text-red-400');
        statusTemperatura.classList.replace('bg-emerald-500/20', 'bg-red-500/20');
        statusTemperatura.classList.replace('text-emerald-400', 'text-red-400');
        statusHumedad.textContent = 'Alerta';
        statusTemperatura.textContent = 'Alerta';
    } else {
        statusHumedad.classList.replace('bg-red-500/20', 'bg-emerald-500/20');
        statusHumedad.classList.replace('text-red-400', 'text-emerald-400');
        statusTemperatura.classList.replace('bg-red-500/20', 'bg-emerald-500/20');
        statusTemperatura.classList.replace('text-red-400', 'text-emerald-400');
        statusHumedad.textContent = 'Óptimo (~80%)';
        statusTemperatura.textContent = 'En Rango';
    }
}

function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caracter]);
}

function renderizarLecturas(tabla, lecturas) {
    tabla.innerHTML = lecturas.map((lectura) => {
        const fechaHora = new Date(`${lectura.fecha_hora_lectura}Z`).toLocaleString('es-CL');
        const estado = lectura.fuera_de_rango ? 'Alerta' : 'Óptimo';
        const clasesEstado = lectura.fuera_de_rango
            ? 'bg-red-500/20 text-red-400'
            : 'bg-emerald-500/20 text-emerald-400';

        return `
          <tr class="hover:bg-slate-700/30">
            <td class="py-3 px-4">${escaparHTML(fechaHora)}</td>
            <td class="py-3 px-4 font-semibold text-cyan-400">${escaparHTML(lectura.humedad_relativa)} %</td>
            <td class="py-3 px-4 font-semibold text-amber-400">${escaparHTML(lectura.temperatura_c)} °C</td>
            <td class="py-3 px-4"><span class="text-xs ${clasesEstado} px-2 py-0.5 rounded">${estado}</span></td>
          </tr>`;
    }).join('');
}

// RF5: Cargar las diez lecturas más recientes
async function cargarUltimasLecturas() {
    const { data: lecturas, error } = await client
        .from('registro_ambiental')
        .select('humedad_relativa, temperatura_c, fuera_de_rango, fecha_hora_lectura')
        .order('fecha_hora_lectura', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error consultando las últimas lecturas ambientales:', error.message);
        return;
    }

    renderizarLecturas(document.getElementById('tabla-ultimas-lecturas'), lecturas);
}

// RF5: Cargar el historial y aplicar, opcionalmente, un rango de fechas
async function actualizarHistorial(fechaInicio, fechaFin) {
    let consulta = client
        .from('registro_ambiental')
        .select('humedad_relativa, temperatura_c, fuera_de_rango, fecha_hora_lectura')
        .order('fecha_hora_lectura', { ascending: false });

    if (fechaInicio) {
        consulta = consulta.gte('fecha_hora_lectura', `${fechaInicio}T00:00:00`);
    }
    if (fechaFin) {
        consulta = consulta.lte('fecha_hora_lectura', `${fechaFin}T23:59:59`);
    }

    const { data: lecturas, error } = await consulta;
    if (error) {
        console.error('Error consultando el historial ambiental:', error.message);
        return;
    }

    renderizarLecturas(document.getElementById('tabla-historial'), lecturas);
}

actualizarPanelAmbiental();
actualizarHistorial();
setInterval(actualizarPanelAmbiental, 5000);

document.getElementById('btn-filtrar').addEventListener('click', () => {
    const fechaInicio = document.getElementById('filtro-inicio').value;
    const fechaFin = document.getElementById('filtro-fin').value;
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
        alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
        return;
    }
    actualizarHistorial(fechaInicio, fechaFin);
});

// RF1: Mostrar y permitir eliminar los riegos programados
let columnaIdCalendario = null;

async function cargarCalendarios() {
    const { data: calendarios, error } = await client
        .from('calendario_riego')
        .select('*')
        .order('hora_riego');

    if (error) {
        console.error('Error consultando los calendarios de riego:', error.message);
        return;
    }

    const tablaCalendarios = document.getElementById('tabla-calendarios');
    columnaIdCalendario = calendarios.length > 0
        ? Object.keys(calendarios[0]).find((columna) =>
            /^id(?:_|$)/.test(columna) && !['id_usuario', 'id_configuracion'].includes(columna)
        )
        : null;
    tablaCalendarios.innerHTML = calendarios.map((calendario) => {
        const dias = Array.isArray(calendario.dias_semana)
            ? calendario.dias_semana.join(', ')
            : calendario.dias_semana;
        const hora = String(calendario.hora_riego ?? '').slice(0, 5);
        const activo = Boolean(calendario.activo);
        const idArgumento = columnaIdCalendario
            ? escaparHTML(JSON.stringify(calendario[columnaIdCalendario]))
            : null;

        return `
          <tr class="hover:bg-slate-700/30">
            <td class="py-3 px-4">${escaparHTML(dias)}</td>
            <td class="py-3 px-4">${escaparHTML(hora)}</td>
            <td class="py-3 px-4"><span class="text-xs ${activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'} px-2 py-0.5 rounded">${activo ? 'Activo' : 'Inactivo'}</span></td>
            <td class="py-3 px-4">${idArgumento
                ? `<button type="button" onclick="toggleCalendario(${idArgumento}, ${activo})" class="text-amber-400 hover:text-amber-300 mr-3">${activo ? 'Pausar' : 'Activar'}</button><button type="button" onclick="eliminarCalendario(${idArgumento})" class="text-red-400 hover:text-red-300">Eliminar</button>`
                : '<span class="text-slate-500">No disponible</span>'}</td>
          </tr>`;
    }).join('');
}

async function toggleCalendario(id, estadoActual) {
    if (!columnaIdCalendario) {
        console.error('No se pudo identificar la columna ID del calendario.');
        return;
    }

    const { error } = await client
        .from('calendario_riego')
        .update({ activo: !estadoActual })
        .eq(columnaIdCalendario, id);

    if (error) {
        console.error('Error actualizando el estado del calendario:', error.message);
        alert('No se pudo actualizar el estado del riego programado.');
    }

    await cargarCalendarios();
}

async function eliminarCalendario(id) {
    if (!confirm('¿Eliminar este riego programado?')) return;
    if (!columnaIdCalendario) {
        console.error('No se pudo identificar la columna ID del calendario.');
        return;
    }

    const { error } = await client
        .from('calendario_riego')
        .delete()
        .eq(columnaIdCalendario, id);

    if (error) {
        console.error('Error eliminando el calendario de riego:', error.message);
        alert('No se pudo eliminar el riego programado.');
    }

    await cargarCalendarios();
}

window.toggleCalendario = toggleCalendario;
window.eliminarCalendario = eliminarCalendario;

// 7. RF3: Cargar los sensores conectados
async function cargarSensores() {
    const { data: sensores, error } = await client
        .from('sensor')
        .select('*');

    if (error) {
        console.error('Error consultando los sensores:', error.message);
        return;
    }

    document.getElementById('contenedor-sensores').innerHTML = sensores.map((sensor) => `
      <div class="flex items-center justify-between p-3 bg-slate-900/90 rounded-lg border border-slate-700">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><i class="fa-solid fa-wifi"></i></div>
          <div>
            <p class="text-sm font-semibold text-white">${escaparHTML(sensor.nombre_dispositivo)}</p>
            <p class="text-xs text-slate-400">Protocolo: ${escaparHTML(sensor.tipo_conexion)} | MAC: ${escaparHTML(sensor.direccion_mac_ip)}</p>
          </div>
        </div>
        <span class="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">En línea</span>
      </div>`).join('');
}

// RF5: Cargar y guardar la frecuencia de registro
async function cargarFrecuencia() {
    const { data: configuracion, error } = await client
        .from('configuracion_invernadero')
        .select('frecuencia_registro_min')
        .eq('id_configuracion', 1)
        .single();

    if (error) {
        console.error('Error consultando la frecuencia de registro:', error.message);
        return;
    }

    document.getElementById('select-frecuencia').value = configuracion.frecuencia_registro_min;
}

document.getElementById('select-frecuencia').addEventListener('change', async (event) => {
    const { error } = await client
        .from('configuracion_invernadero')
        .update({ frecuencia_registro_min: Number(event.target.value) })
        .eq('id_configuracion', 1);

    if (error) {
        console.error('Error guardando la frecuencia de registro:', error.message);
        return;
    }

    console.log('Frecuencia de registro actualizada correctamente.');
});

let temporizadorRiegoManual;

document.getElementById('btn-riego-manual').addEventListener('click', async () => {
    const textoActuador = document.getElementById('texto-actuador');
    textoActuador.textContent = 'Regando...';
    textoActuador.classList.replace('text-white', 'text-cyan-400');

    clearTimeout(temporizadorRiegoManual);
    temporizadorRiegoManual = setTimeout(() => {
        textoActuador.textContent = 'En Espera';
        textoActuador.classList.replace('text-cyan-400', 'text-white');
    }, 5000);

    if ('Notification' in window) {
        const permiso = Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permiso === 'granted') {
            new Notification('Riego manual activado');
        }
    }
});

cargarSensores();
cargarFrecuencia();
cargarCalendarios();
cargarUltimasLecturas();
setInterval(cargarUltimasLecturas, 5000);