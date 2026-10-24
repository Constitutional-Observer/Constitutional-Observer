import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({ MEILI_HOST: { static: true }, MEILI_KEY: { static: true } });
