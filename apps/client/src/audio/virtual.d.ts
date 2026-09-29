// The list of recorded sound files, made by the `tdt-sound-files` plugin (vite.config.ts).
declare module 'virtual:tdt-sound-files' {
  const files: { dir: 'music' | 'sfx'; name: string; hash: string }[];
  export default files;
}
