// Legacy entry point, kept only so old launch commands fail with a clear message.
// The supported server lives in server/ (TypeScript): see server.ts.
console.error(
  'Legacy server.js jest zablokowany. Uruchom wspierany serwer TypeScript przez "npm run dev:server" albo "npm start".',
);
process.exit(1);
