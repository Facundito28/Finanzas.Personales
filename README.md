# 💰 Mis Finanzas

**Controlá tus ingresos y gastos en ARS y USD desde cualquier dispositivo.**

Una app web personal de finanzas con sync en la nube, dashboard con gráficos, y soporte bimoneda pensada para el día a día argentino.

> 🔗 **[Usala acá →](https://facundito28.github.io/Finanzas.Personales/)**

---

## ✨ Features

| Feature | Descripción |
|---------|-------------|
| 📊 **Dashboard** | Balance consolidado, totales separados ARS/USD, gráficos de tendencia de 6 meses |
| 🍩 **Gráfico de torta** | Distribución visual de gastos por categoría |
| 💱 **Bimoneda ARS + USD** | Tipo de cambio oficial editable, conversión automática |
| 📱 **Mobile-first** | Diseñada para el celular, funciona perfecto en PC también |
| ☁️ **Sync en la nube** | Los datos se sincronizan entre dispositivos via Supabase |
| 🔐 **Login seguro** | Registro e inicio de sesión con email y contraseña |
| 📥 **Exportar CSV** | Descargá todos tus movimientos en formato Excel/CSV |
| 💰 **Presupuestos** | Definí límites mensuales por categoría y seguí tu progreso |
| 🔄 **Gastos recurrentes** | Cargá Netflix, Spotify, etc. y se repite automáticamente por 12 meses |
| 🔍 **Filtros avanzados** | Filtrá movimientos por categoría y moneda |
| 🔑 **Recuperar contraseña** | Reset por email si te olvidás la clave |

## 📸 Screenshots

La app tiene un diseño dark mode con estética moderna y limpia:

- **Landing page** de bienvenida con features
- **Dashboard** con balance, gráficos de barras y torta
- **Formulario** rápido con chips de categoría
- **Lista** con filtros y acciones de editar/eliminar

## 🚀 Tech Stack

- **Frontend**: HTML + CSS + JavaScript vanilla (un solo archivo, sin build)
- **Backend**: [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime)
- **Hosting**: GitHub Pages (gratis)
- **Fonts**: Plus Jakarta Sans

## 📋 Categorías disponibles

**Ingresos**: Sueldo, Freelance, Inversiones, Otros

**Gastos**: Alquiler/Expensas, Supermercado, Delivery/Comida, Transporte, Salidas, Suscripciones, Ropa, Salud, Educación, Ahorro/Inversión, Otros

## 🛠️ Setup para desarrollo

### Prerrequisitos
- Una cuenta en [Supabase](https://supabase.com) (gratis)
- Una cuenta en [GitHub](https://github.com)

### 1. Crear proyecto en Supabase

1. Creá un proyecto nuevo en [supabase.com](https://supabase.com)
2. Andá a **SQL Editor** y corré:

```sql
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'gasto')),
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  date DATE NOT NULL,
  tc_oficial NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  exchange_rate NUMERIC DEFAULT 1080,
  budgets TEXT DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions" ON transactions
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_txn_user_date ON transactions(user_id, date DESC);
```

3. Andá a **Settings → API** y copiá tu `Project URL` y `anon key`

### 2. Configurar el código

En `index.html`, reemplazá las variables al inicio del `<script>`:

```javascript
const SUPA_URL = 'https://TU_PROYECTO.supabase.co';
const SUPA_KEY = 'tu_anon_key_aca';
```

### 3. Deploy en GitHub Pages

1. Subí `index.html` a tu repo
2. Settings → Pages → Source: "main" branch → Save
3. ¡Listo! Tu app estará en `tuusuario.github.io/tu-repo`

## 📄 Estructura

```
📁 Finanzas.Personales/
├── index.html    ← Toda la app (HTML + CSS + JS)
└── README.md     ← Este archivo
```

Sí, es **un solo archivo**. Sin build, sin node_modules, sin frameworks. Funciona directo.

## 🔒 Seguridad

- Autenticación manejada por Supabase Auth (bcrypt + JWT)
- Row Level Security: cada usuario solo puede ver/editar sus propios datos
- La anon key es segura para uso público (solo permite operaciones autorizadas por RLS)
- Contraseñas nunca se almacenan en el frontend

## 🤝 Contribuciones

¿Tenés ideas para mejorar la app? Abrí un issue o mandate un PR.

## 📝 Licencia

MIT — Usalo como quieras.

---

Hecho con ❤️ desde Tucumán, Argentina
