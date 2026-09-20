import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: ['src/styles/index.css', 'src/layouts/App.jsx'],
            refresh: true,
        }),
        react(),
    ],
});