import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.jsx'],
            refresh: true,
        }),
        react(),
    ],
    /* 🛠️ ADD THIS BUILD OBJECT TARGET */
    build: {
        outDir: 'dist', // Forces Vite to override Laravel rules and output the exact folder Vercel needs
        emptyOutDir: true,
    }
});
