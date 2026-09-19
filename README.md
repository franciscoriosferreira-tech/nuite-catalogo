# Nuité Perfumes

Tienda integrada de perfumes y sorteos construida con Astro, Supabase, Vercel y Flow.

## Experiencias incluidas

- Catálogo conectado al inventario de Supabase.
- Carrito persistente y checkout de perfumes.
- Pago de perfumes mediante Flow, validado en el servidor.
- Confirmación idempotente y descuento de stock en una transacción de PostgreSQL.
- Sorteos dentro del mismo sitio, con packs solicitados exclusivamente por WhatsApp.

Los tickets de sorteos nunca se agregan al carrito y nunca se envían a Flow.

## Ejecutar en local

```powershell
pnpm install
pnpm dev
```

La interfaz y el carrito funcionan sin credenciales. Para completar un pago se requieren las variables de `.env.example`, una URL HTTPS pública para los callbacks y la migración de Supabase.

## Activar Flow de forma segura

1. Aplicar `supabase/migrations/202609190001_store_checkout.sql` primero en un proyecto de desarrollo.
2. Copiar `.env.example` a `.env` y completar las variables sin subir ese archivo a Git.
3. Mantener `FLOW_ENV=sandbox` y usar las credenciales de prueba de Flow.
4. Definir `PUBLIC_SITE_URL` con la URL HTTPS pública del despliegue o túnel de desarrollo.
5. Probar pago aprobado, rechazado, pendiente, doble callback y falta de stock.
6. Cambiar a producción solamente después de revisar las órdenes y el descuento de inventario.

Flow envía un `POST` a `/api/flow/confirmation`; el servidor consulta el estado nuevamente en Flow antes de marcar la orden como pagada. La URL de retorno por sí sola nunca confirma una compra.

## Comandos

| Comando | Acción |
| --- | --- |
| `pnpm dev` | Servidor local |
| `pnpm build` | Compilación para Vercel |
| `pnpm preview` | Vista previa de producción |
