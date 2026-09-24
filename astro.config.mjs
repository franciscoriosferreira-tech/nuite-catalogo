// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // Flow entrega la confirmacion y el retorno mediante formularios POST
  // enviados desde su propio dominio. Cada callback valida el token contra
  // la API firmada de Flow antes de modificar una orden.
  security: {
    checkOrigin: false,
  },
  adapter: vercel(),
});
