'use strict';
/* LK ONE · catálogos y seguridad básica (sin DOM, sin red): actividades, países, monedas, roles y permisos, hash de PIN. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LKCatalog = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {

// ---------- módulos ----------
const MODULES = [['crm', 'Clientes y CRM'], ['agenda', 'Agenda y reservas'], ['sales', 'Ventas y pedidos'], ['cash', 'Caja y finanzas'], ['inventory', 'Inventario'], ['services', 'Productos y servicios'], ['operations', 'Operaciones y proyectos'], ['pos', 'LK POS · Punto de venta'], ['team', 'Equipo y permisos'], ['subscriptions', 'Suscripciones'], ['marketing', 'Marketing y fidelización'], ['automations', 'Automatizaciones y WhatsApp'], ['reports', 'Reportes y analítica']];
// Página del menú → módulo que la habilita (home y settings siempre visibles)
const PAGE_MODULE = { appointments: 'agenda', clients: 'crm', commercial: 'sales', cash: 'cash', services: 'services', inventory: 'inventory', work: 'operations', automations: 'automations', reports: 'reports', pos: 'pos' };

// ---------- actividades: [id, etiqueta, sector (profile.type), módulos recomendados] ----------
const M = {
  appt: ['crm', 'agenda', 'services', 'pos', 'cash', 'inventory', 'team', 'marketing', 'automations', 'reports'],
  prof: ['crm', 'agenda', 'services', 'pos', 'sales', 'cash', 'inventory', 'operations', 'automations', 'reports'],
  gastro: ['crm', 'pos', 'sales', 'cash', 'inventory', 'team', 'marketing', 'reports'],
  gastroRes: ['crm', 'pos', 'agenda', 'sales', 'cash', 'inventory', 'team', 'marketing', 'reports'],
  retail: ['crm', 'pos', 'sales', 'cash', 'inventory', 'services', 'marketing', 'automations', 'reports'],
  ecom: ['crm', 'sales', 'cash', 'inventory', 'marketing', 'automations', 'reports'],
  tech: ['crm', 'agenda', 'sales', 'services', 'cash', 'inventory', 'operations', 'team', 'reports'],
  build: ['crm', 'sales', 'cash', 'inventory', 'operations', 'team', 'reports'],
  real: ['crm', 'agenda', 'sales', 'cash', 'operations', 'automations', 'reports'],
  log: ['crm', 'sales', 'inventory', 'operations', 'team', 'reports'],
  health: ['crm', 'agenda', 'services', 'cash', 'inventory', 'automations', 'reports'],
  edu: ['crm', 'agenda', 'services', 'cash', 'subscriptions', 'automations', 'reports'],
  hotel: ['crm', 'agenda', 'sales', 'cash', 'operations', 'team', 'reports'],
  digital: ['crm', 'sales', 'subscriptions', 'marketing', 'automations', 'reports'],
  agro: ['crm', 'sales', 'cash', 'inventory', 'operations', 'team', 'reports'],
  other: ['crm', 'sales', 'cash', 'operations', 'reports']
};
const ACTIVITIES = [
  // belleza y bienestar
  ['barbershop', 'Barbería', 'beauty', M.appt], ['hairsalon', 'Peluquería', 'beauty', M.appt], ['beautysalon', 'Salón de belleza', 'beauty', M.appt], ['spa', 'Spa y centro de bienestar', 'beauty', M.appt], ['nails', 'Uñas y estética', 'beauty', M.appt], ['gym', 'Gimnasio y entrenamiento', 'health', M.edu],
  // gastronomía (LK POS)
  ['restaurant', 'Restaurante', 'food', M.gastroRes], ['gastrobar', 'Gastrobar', 'food', M.gastroRes], ['bar', 'Bar y discoteca', 'food', M.gastro], ['cafe', 'Cafetería', 'food', M.gastro], ['bakery', 'Panadería y pastelería', 'food', M.gastro], ['fastfood', 'Comidas rápidas', 'food', M.gastro], ['pizzeria', 'Pizzería', 'food', M.gastro], ['burger', 'Hamburguesería', 'food', M.gastro], ['icecream', 'Heladería', 'food', M.gastro], ['smoothies', 'Granizados y bebidas', 'food', M.gastro], ['juicebar', 'Juguería', 'food', M.gastro], ['foodtruck', 'Food truck', 'food', M.gastro], ['catering', 'Catering y eventos', 'food', M.gastro], ['delivery', 'Negocio de domicilios', 'food', M.gastro], ['foodother', 'Otro establecimiento gastronómico', 'food', M.gastro],
  // comercio
  ['clothing', 'Tienda de ropa y moda', 'retail', M.retail], ['minimarket', 'Minimercado', 'retail', M.retail], ['grocery', 'Abarrotes y tienda de barrio', 'retail', M.retail], ['convenience_store', 'Tienda de conveniencia', 'retail', M.retail], ['supermarket', 'Supermercado', 'retail', M.retail], ['butcher', 'Carnicería y charcutería', 'retail', M.retail], ['stationery', 'Papelería y librería', 'retail', M.retail], ['florist', 'Floristería', 'retail', M.retail], ['electronics', 'Electrónica y tecnología', 'retail', M.retail], ['retail_general', 'Comercio minorista', 'retail', M.retail], ['wholesale', 'Comercio mayorista', 'retail', M.retail], ['ecommerce', 'Ecommerce', 'retail', M.ecom], ['hardware', 'Ferretería', 'retail', M.retail], ['homedecor', 'Hogar y decoración', 'retail', M.retail], ['pharmacy', 'Droguería y farmacia', 'retail', M.retail], ['pets', 'Mascotas y veterinaria', 'retail', M.appt],
  // servicios
  ['professional_services', 'Servicios profesionales', 'services', M.prof], ['legal', 'Abogados y asesoría legal', 'services', M.prof], ['accounting', 'Contabilidad y consultoría', 'services', M.prof], ['realestate', 'Inmobiliaria', 'services', M.real], ['workshop', 'Taller y servicio técnico', 'automotive', M.tech], ['carwash', 'Lavado y mantenimiento de vehículos', 'automotive', M.tech], ['construction', 'Construcción e instalaciones', 'construction', M.build], ['logistics', 'Logística y transporte', 'logistics', M.log], ['cleaning', 'Aseo y mantenimiento', 'services', M.prof],
  // salud, educación, turismo, digital, agro
  ['clinic', 'Consultorio y clínica', 'health', M.health], ['dentist', 'Odontología', 'health', M.health], ['psychology', 'Psicología y terapias', 'health', M.health], ['school', 'Academia y educación', 'education', M.edu], ['hotel', 'Hotel y alojamiento', 'hospitality', M.hotel], ['tourism', 'Turismo y agencia de viajes', 'hospitality', M.hotel], ['digital', 'Negocio digital y suscripciones', 'digital', M.digital], ['agency', 'Agencia de marketing y diseño', 'digital', M.prof], ['agriculture', 'Agricultura y agroindustria', 'other', M.agro], ['other', 'Otra actividad', 'other', M.other]
].map(([id, label, sector, modules]) => ({ id, label, sector, modules, pos: modules.includes('pos') }));
const SECTOR_DEFAULT_ACTIVITY = { retail: 'retail_general', services: 'professional_services', beauty: 'barbershop', food: 'restaurant', health: 'clinic', education: 'school', construction: 'construction', automotive: 'workshop', logistics: 'logistics', hospitality: 'hotel', digital: 'digital', other: 'other' };
const SECTORS = Object.keys(SECTOR_DEFAULT_ACTIVITY);
const findActivity = v => { const s = String(v ?? '').trim().toLowerCase(); return ACTIVITIES.find(a => a.id === s || a.label.toLowerCase() === s) || null; };

// ---------- países: [nombre, ISO2, moneda, zona horaria sugerida] ----------
const COUNTRIES = [
  ['Argentina', 'AR', 'ARS', 'America/Argentina/Buenos_Aires'], ['Bolivia', 'BO', 'BOB', 'America/La_Paz'], ['Brasil', 'BR', 'BRL', 'America/Sao_Paulo'], ['Chile', 'CL', 'CLP', 'America/Santiago'], ['Colombia', 'CO', 'COP', 'America/Bogota'], ['Costa Rica', 'CR', 'CRC', 'America/Costa_Rica'], ['Cuba', 'CU', 'CUP', 'America/Havana'], ['Ecuador', 'EC', 'USD', 'America/Guayaquil'], ['El Salvador', 'SV', 'USD', 'America/El_Salvador'], ['Guatemala', 'GT', 'GTQ', 'America/Guatemala'], ['Honduras', 'HN', 'HNL', 'America/Tegucigalpa'], ['México', 'MX', 'MXN', 'America/Mexico_City'], ['Nicaragua', 'NI', 'NIO', 'America/Managua'], ['Panamá', 'PA', 'USD', 'America/Panama'], ['Paraguay', 'PY', 'PYG', 'America/Asuncion'], ['Perú', 'PE', 'PEN', 'America/Lima'], ['Puerto Rico', 'PR', 'USD', 'America/Puerto_Rico'], ['República Dominicana', 'DO', 'DOP', 'America/Santo_Domingo'], ['Uruguay', 'UY', 'UYU', 'America/Montevideo'], ['Venezuela', 'VE', 'VES', 'America/Caracas'],
  ['Estados Unidos', 'US', 'USD', 'America/New_York'], ['Canadá', 'CA', 'CAD', 'America/Toronto'],
  ['España', 'ES', 'EUR', 'Europe/Madrid'], ['Portugal', 'PT', 'EUR', 'Europe/Lisbon'], ['Francia', 'FR', 'EUR', 'Europe/Paris'], ['Alemania', 'DE', 'EUR', 'Europe/Berlin'], ['Italia', 'IT', 'EUR', 'Europe/Rome'], ['Reino Unido', 'GB', 'GBP', 'Europe/London'], ['Irlanda', 'IE', 'EUR', 'Europe/Dublin'], ['Países Bajos', 'NL', 'EUR', 'Europe/Amsterdam'], ['Bélgica', 'BE', 'EUR', 'Europe/Brussels'], ['Suiza', 'CH', 'CHF', 'Europe/Zurich'], ['Suecia', 'SE', 'SEK', 'Europe/Stockholm'], ['Noruega', 'NO', 'NOK', 'Europe/Oslo'], ['Dinamarca', 'DK', 'DKK', 'Europe/Copenhagen'], ['Polonia', 'PL', 'PLN', 'Europe/Warsaw'], ['Rumanía', 'RO', 'RON', 'Europe/Bucharest'], ['Grecia', 'GR', 'EUR', 'Europe/Athens'], ['Turquía', 'TR', 'TRY', 'Europe/Istanbul'], ['Rusia', 'RU', 'RUB', 'Europe/Moscow'], ['Ucrania', 'UA', 'UAH', 'Europe/Kyiv'],
  ['Marruecos', 'MA', 'MAD', 'Africa/Casablanca'], ['Egipto', 'EG', 'EGP', 'Africa/Cairo'], ['Nigeria', 'NG', 'NGN', 'Africa/Lagos'], ['Kenia', 'KE', 'KES', 'Africa/Nairobi'], ['Sudáfrica', 'ZA', 'ZAR', 'Africa/Johannesburg'], ['Ghana', 'GH', 'GHS', 'Africa/Accra'],
  ['Emiratos Árabes Unidos', 'AE', 'AED', 'Asia/Dubai'], ['Arabia Saudita', 'SA', 'SAR', 'Asia/Riyadh'], ['Israel', 'IL', 'ILS', 'Asia/Jerusalem'], ['India', 'IN', 'INR', 'Asia/Kolkata'], ['Pakistán', 'PK', 'PKR', 'Asia/Karachi'], ['Bangladés', 'BD', 'BDT', 'Asia/Dhaka'], ['China', 'CN', 'CNY', 'Asia/Shanghai'], ['Japón', 'JP', 'JPY', 'Asia/Tokyo'], ['Corea del Sur', 'KR', 'KRW', 'Asia/Seoul'], ['Singapur', 'SG', 'SGD', 'Asia/Singapore'], ['Malasia', 'MY', 'MYR', 'Asia/Kuala_Lumpur'], ['Tailandia', 'TH', 'THB', 'Asia/Bangkok'], ['Vietnam', 'VN', 'VND', 'Asia/Ho_Chi_Minh'], ['Indonesia', 'ID', 'IDR', 'Asia/Jakarta'], ['Filipinas', 'PH', 'PHP', 'Asia/Manila'], ['Australia', 'AU', 'AUD', 'Australia/Sydney'], ['Nueva Zelanda', 'NZ', 'NZD', 'Pacific/Auckland']
];
const findCountry = v => { const s = String(v ?? '').trim().toLowerCase(); return COUNTRIES.find(c => c[0].toLowerCase() === s || c[1].toLowerCase() === s) || null; };

// ---------- monedas internacionales ----------
const CURRENCIES = [['COP', 'Peso colombiano'], ['USD', 'Dólar estadounidense'], ['EUR', 'Euro'], ['GBP', 'Libra esterlina'], ['MXN', 'Peso mexicano'], ['PEN', 'Sol peruano'], ['CLP', 'Peso chileno'], ['ARS', 'Peso argentino'], ['BRL', 'Real brasileño'], ['BOB', 'Boliviano'], ['CRC', 'Colón costarricense'], ['CUP', 'Peso cubano'], ['DOP', 'Peso dominicano'], ['GTQ', 'Quetzal guatemalteco'], ['HNL', 'Lempira hondureño'], ['NIO', 'Córdoba nicaragüense'], ['PYG', 'Guaraní paraguayo'], ['UYU', 'Peso uruguayo'], ['VES', 'Bolívar venezolano'], ['CAD', 'Dólar canadiense'], ['CHF', 'Franco suizo'], ['SEK', 'Corona sueca'], ['NOK', 'Corona noruega'], ['DKK', 'Corona danesa'], ['PLN', 'Esloti polaco'], ['RON', 'Leu rumano'], ['TRY', 'Lira turca'], ['RUB', 'Rublo ruso'], ['UAH', 'Grivna ucraniana'], ['MAD', 'Dírham marroquí'], ['EGP', 'Libra egipcia'], ['NGN', 'Naira nigeriano'], ['KES', 'Chelín keniano'], ['ZAR', 'Rand sudafricano'], ['GHS', 'Cedi ghanés'], ['AED', 'Dírham emiratí'], ['SAR', 'Riyal saudí'], ['ILS', 'Séquel israelí'], ['INR', 'Rupia india'], ['PKR', 'Rupia pakistaní'], ['BDT', 'Taka bangladesí'], ['CNY', 'Yuan chino'], ['JPY', 'Yen japonés'], ['KRW', 'Won surcoreano'], ['SGD', 'Dólar de Singapur'], ['MYR', 'Ringgit malayo'], ['THB', 'Baht tailandés'], ['VND', 'Dong vietnamita'], ['IDR', 'Rupia indonesia'], ['PHP', 'Peso filipino'], ['AUD', 'Dólar australiano'], ['NZD', 'Dólar neozelandés']];
const CURRENCY_CODES = CURRENCIES.map(c => c[0]);

// ---------- roles y permisos ----------
const ROLES = { admin: 'Administrador', manager: 'Gerente', employee: 'Empleado', waiter: 'Mesero', cashier: 'Cajero', kitchen: 'Personal de cocina' };
const P_ALL_PAGES = ['page.home', 'page.appointments', 'page.clients', 'page.commercial', 'page.cash', 'page.services', 'page.inventory', 'page.work', 'page.automations', 'page.reports', 'page.settings', 'page.pos'];
const ROLE_PERMS = {
  admin: ['*'],
  manager: [...P_ALL_PAGES, 'edit.records', 'delete.records', 'inventory.edit', 'services.edit', 'finance.edit', 'pos.tables', 'pos.orders', 'pos.kitchen', 'pos.pay', 'pos.shift', 'pos.discount', 'pos.refund', 'pos.void', 'pos.menu', 'pos.reports', 'pos.settings', 'settings.profile'],
  employee: ['page.home', 'page.appointments', 'page.clients', 'page.commercial', 'page.services', 'page.work', 'page.inventory', 'edit.records'],
  waiter: ['page.home', 'page.pos', 'pos.tables', 'pos.orders'],
  cashier: ['page.home', 'page.pos', 'page.cash', 'page.clients', 'pos.tables', 'pos.orders', 'pos.pay', 'pos.shift', 'edit.records'],
  kitchen: ['page.pos', 'pos.kitchen']
};
const PERM_LABELS = { 'pos.discount': 'aplicar descuentos', 'pos.refund': 'registrar reembolsos', 'pos.void': 'anular productos enviados o cancelar cuentas', 'pos.shift': 'abrir/cerrar caja', 'pos.pay': 'registrar pagos', 'pos.menu': 'editar menú y mesas', 'pos.settings': 'cambiar la configuración de LK POS', 'inventory.edit': 'cambiar el inventario', 'delete.records': 'eliminar registros', 'users.manage': 'administrar usuarios', 'pos.orders': 'tomar pedidos', 'pos.kitchen': 'usar la vista de cocina', 'pos.reports': 'ver reportes de LK POS' };
const can = (user, perm) => { const role = user && user.role; const list = ROLE_PERMS[role] || []; return list.includes('*') || list.includes(perm); };
const ADMIN_ACTOR = { id: 0, name: 'Administrador', role: 'admin' };

// ---------- hash de PIN (SHA-256 iterado con sal; protección básica, no sustituye autenticación de servidor) ----------
const sha256 = (() => {
  const K = [], H = [];
  for (let n = 2, c = 0; c < 64; n++) { let p = true; for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; } if (p) { if (c < 8) H[c] = (Math.sqrt(n) % 1 * 4294967296) | 0; K[c++] = (Math.cbrt(n) % 1 * 4294967296) | 0; } }
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  return function (msg) {
    const bytes = Array.from(new TextEncoder().encode(String(msg))), bits = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
    const h = H.slice(), w = new Array(64);
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();
const newSalt = () => { let s = ''; try { const a = new Uint8Array(8); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); s = Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { s = String(Math.random()).slice(2, 18); } return s; };
const hashPin = (pin, salt) => { let h = String(salt) + ':' + String(pin); for (let i = 0; i < 1500; i++) h = sha256(h + salt); return h; };

return { MODULES, PAGE_MODULE, ACTIVITIES, SECTOR_DEFAULT_ACTIVITY, SECTORS, findActivity, COUNTRIES, findCountry, CURRENCIES, CURRENCY_CODES, ROLES, ROLE_PERMS, PERM_LABELS, can, ADMIN_ACTOR, sha256, newSalt, hashPin };
});
