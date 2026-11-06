// 1. Inicializar conexión directa con Supabase
const supabaseUrl = 'https://sfgrxnrsayrinsgiuaei.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZ3J4bnJzYXlyaW5zZ2l1YWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDU2ODksImV4cCI6MjEwOTQ4MTY4OX0.S5L67Q0pyPlt6FX6z7V0sDbm7wZ_RfLlfywR5_iPRkc';
const client = supabase.createClient(supabaseUrl, supabaseAnonKey);

// 2. Solicitar permisos para Notificaciones Nativas del Navegador (Notification API)
if (Notification.permission !== "granted") {
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

    if (riegosDeHoy.length > 0) {
        new Notification("Alerta de Riego (OrchidCare IoT)", {
            body: "Riego automático activado para Sector Orquídeas Demo",
            icon: "https://cdn-icons-png.flaticon.com/512/2928/2928883.png"
        });
        console.log("¡Notificación enviada al sistema operativo!");
    }
}, 1000);