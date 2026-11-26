import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { cpSync } from 'node:fs';
import { basename } from 'node:path';
export default defineConfig({
    plugins: [vue(), basicSsl(), {
        name: 'copy-public-without-dev-cache',
        apply: 'build',
        writeBundle({ dir }) {
            if (!dir) throw new Error('ビルド出力ディレクトリが必要です');
            //公開用ファイルだけをコピー
            cpSync(new URL('./public/', import.meta.url), dir, {
                recursive: true,
                filter: source => basename(source) !== '.wrangler',
            });
        },
    }],
    build: { copyPublicDir: false },
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
