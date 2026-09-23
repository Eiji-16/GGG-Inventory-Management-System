import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/GGG-Inventory-Management-System/', // 👈 This tells GitHub Pages where to find your files
    plugins: [
        laravel({
            input: ['src/styles/index.css', 'src/layouts/App.jsx'],
            refresh: true,
        }),
        react(),
    ],
});
