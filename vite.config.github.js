import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/GGG-Inventory-Management-System/',
    plugins: [react()],
    build: {
        outDir: 'dist' // Forces Vite to create the missing 'dist' folder
    }
});
