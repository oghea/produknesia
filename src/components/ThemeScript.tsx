// Server-rendered theme init: runs synchronously before first paint so the
// stored (or system) theme applies without a flash. Rendered from a server
// component, so React never "renders" a script tag on the client.
const themeInit = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInit }} />;
}
