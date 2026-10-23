import { defineConfig } from 'vite';
import { openmesModule } from '@openmes/module';

export default defineConfig({
    publicDir: false,
    // Keep runtime pages outside core's build-time modules/*/resources/js/Pages glob.
    // Otherwise an older page embedded in the core bundle can shadow an update.
    plugins: [
        openmesModule({
            entry: '/resources/js/bootstrap.jsx',
            pages: '/resources/js/runtime/Pages/**/*.jsx',
        }),
    ],
    esbuild: { jsx: 'automatic' },
    build: { target: 'es2022', sourcemap: false },
});
