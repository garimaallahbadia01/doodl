# Development Workflow

### Requirements
- Node.js LTS
- Modern Browser with Camera permissions enabled

### Getting Started

Install only the local development toolchain (Vite & TypeScript definitions):
```bash
npm install
```

Start the Vite development server with Hot-Module Replacement (HMR):
```bash
npm run dev
```

Navigate to `http://localhost:3000` (or whatever specific port the terminal provides) to see Doodle running. Ensure you are well lit with a clear view of your hands in the PIP.

### Production Dist

To compile everything into final minified bundles for hosting (GitHub pages, Vercel, Netlify):
```bash
npm run build
```

This will run TypeScript type-checks (`tsc`) locally and output purely flat client-side files into the `dist/` directory.

### Notes on MediaPipe Loader
Please note you do **NOT** need to `npm install` MediaPipe. It is loaded externally over `unpkg` via the `<script>` tag logic to prevent massively inflating your `node_modules` and extending initialization times. If modifying `handTracking.ts` or `main.ts`, ensure `//@ts-ignore` flags remain above the `CDN` imports.
