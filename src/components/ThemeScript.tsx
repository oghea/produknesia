// First-visit theme init: when no theme cookie exists yet, apply the system
// preference before first paint and persist it as a cookie so the SERVER
// renders the `dark` class on every subsequent request. (Server-rendered
// class is what survives locale-switch re-renders of the root layout.)
// Also migrates the legacy localStorage value from the pre-cookie version.
const themeInit = `(function(){try{if(document.cookie.split("; ").some(function(c){return c.indexOf("theme=")===0}))return;var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.cookie="theme="+(d?"dark":"light")+"; path=/; max-age=31536000; samesite=lax";}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInit }} />;
}
