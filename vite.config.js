import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    // No "base" here: Laravel's Vite plugin serves the built files from /build/.
    // The GitHub Pages build has its own address in vite.config.github.js.
    plugins: [
        laravel({
            input: ['src/styles/index.css', 'src/layouts/App.jsx'],
            refresh: true,
        }),
        react(),
    ],
});
