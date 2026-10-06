// The backend now runs in Workers. Use `npm run dev:worker` for the complete app.
// Vite development proxies /api to the local Worker on port 8787.
console.error('Express has been replaced by Workers. Run npm run dev:worker.');
process.exitCode = 1;
