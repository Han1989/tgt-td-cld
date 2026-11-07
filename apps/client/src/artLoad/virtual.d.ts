// Each match picture's bytes, made by the `tdt-art-bytes` plugin (vite.config.ts).
declare module 'virtual:tdt-art-bytes' {
  const bytes: Partial<Record<import('./rules').SheetId, number>>;
  export default bytes;
}
