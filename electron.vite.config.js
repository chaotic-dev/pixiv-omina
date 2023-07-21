import { resolve } from 'path'

const projectRootDir = resolve(__dirname);

// electron.vite.config.js
export default {
    main: {
        root: 'src',
        build: {
          // Relative to the root
          outDir: 'dist',
        },
        resolve: {
          alias: {
            "@": resolve(projectRootDir, "src", "main"),
          },
        }
    },
 /*   preload: {
    },
    renderer: {
    } */
  }