import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
export default defineConfig({
    plugins: [vue(), basicSsl()],
    server: {
        host: 'localhost',
        port: 8788,
        strictPort: true,
        proxy: {
            '/api': { target: 'https://127.0.0.1:8789', secure: false },
            '/auth': { target: 'https://127.0.0.1:8789', secure: false },
        },
    },
});
