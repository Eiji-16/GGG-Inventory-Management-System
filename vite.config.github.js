import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/GGG-Inventory-Management-System/',
    plugins: [react()],
    build: {
        outDir: 'dist', // Creates the folder gh-pages is looking for
        rollupOptions: {
            input: {
                main: 'index.html', // Points to the index.html you created in the root
            }
        }
    }
});
